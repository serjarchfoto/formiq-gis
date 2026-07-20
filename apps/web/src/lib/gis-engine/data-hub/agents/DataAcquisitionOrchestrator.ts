import type { CanonicalDomain, DataHubError, DataHubWarning, AnalysisDataRequirement, TerritoryReference } from "../types";
import { AgentBus } from "./AgentBus";
import type { AgentBusApi } from "./types";
import type { DataHubLogger } from "../Observability";
import { NoopDataHubLogger } from "../Observability";
import type {
  AgentOrchestratorDependencies,
  DataAcquisitionJob,
  AgentJobStatus,
  CoverageAssessmentInput,
} from "./types";

export interface StartAcquisitionInput {
  projectId: string;
  territory: TerritoryReference;
  requestedDomains: CanonicalDomain[];
  requirements?: AnalysisDataRequirement[];
  maxAttempts?: number;
  maxSourceRetries?: number;
}

export class DataAcquisitionOrchestrator {
  private readonly bus: AgentBusApi;
  private readonly dependencies: AgentOrchestratorDependencies;
  private readonly logger: DataHubLogger;

  constructor(dependencies: AgentOrchestratorDependencies) {
    this.bus = dependencies.bus ?? new AgentBus();
    this.logger = dependencies.logger ?? new NoopDataHubLogger();
    this.dependencies = { ...dependencies, bus: this.bus, sleep: dependencies.sleep ?? defaultSleep };
  }

  get agentBus(): AgentBusApi { return this.bus; }

  async startAcquisition(input: StartAcquisitionInput): Promise<DataAcquisitionJob> {
    const job = createJob(input);
    await this.dependencies.jobRepository.create(job);
    return this.runJob(job);
  }

  async getJob(jobId: string): Promise<DataAcquisitionJob | null> { return this.dependencies.jobRepository.get(jobId); }

  async listJobs(projectId: string): Promise<DataAcquisitionJob[]> { return this.dependencies.jobRepository.listByProject(projectId); }

  async cancelJob(jobId: string): Promise<DataAcquisitionJob | null> {
    const current = await this.dependencies.jobRepository.get(jobId);
    if (!current) return null;
    await this.dependencies.acquisitionExecution.cancel(jobId);
    const cancelled = withStatus(current, "cancelled", { warnings: [...current.warnings, warning("Acquisition cancelled by user.")] });
    await this.dependencies.jobRepository.update(cancelled);
    this.publish(cancelled, "cancelled");
    return cancelled;
  }

  async resumeJob(jobId: string): Promise<DataAcquisitionJob> {
    const current = await this.dependencies.jobRepository.get(jobId);
    if (!current) throw new Error(`Acquisition job "${jobId}" was not found.`);
    if (!["created", "assessing", "planning", "acquiring", "reviewing", "partial", "waiting_manual_review"].includes(current.status)) return current;
    return this.runJob(current);
  }

  private async runJob(initial: DataAcquisitionJob): Promise<DataAcquisitionJob> {
    let job = initial;
    try {
      while (job.attempt < job.maxAttempts) {
        if (job.status === "cancelled") return job;
        job = await this.setStatus(job, "assessing");
        const assessment = await this.dependencies.coverageAssessment.assess({
          projectId: job.projectId,
          territoryId: job.territoryId,
          requestedDomains: job.requestedDomains,
          requirements: job.requirements,
        } satisfies CoverageAssessmentInput);
        job = await this.save({ ...job, lastCoverage: assessment, warnings: [...job.warnings, ...toWarnings(assessment.warnings)] });
        this.publish(job, "coverage-assessed", assessment);

        if (assessment.missingDomains.length === 0 && assessment.belowThresholdDomains.length === 0 && assessment.outdatedDomains.length === 0) {
          return this.setStatus(job, "completed");
        }

        job = await this.setStatus(job, "planning");
        const gapDomains = unique([...assessment.missingDomains, ...assessment.partialDomains, ...assessment.outdatedDomains, ...assessment.belowThresholdDomains]);
        let decisions = await this.dependencies.sourcePlanning.plan({ projectId: job.projectId, territoryId: job.territoryId, domains: gapDomains });
        decisions = restrictRetryExhausted(decisions, job.sourceRetryCounts ?? {}, job.maxSourceRetries ?? 2);
        job = await this.save({ ...job, decisions });
        this.publish(job, "sources-planned", decisions);

        if (decisions.some((decision) => decision.selectedSourceIds.length === 0)) {
          return this.setStatus(job, "waiting_manual_review", { warnings: [...job.warnings, warning("No automated source is available for one or more gaps.")] });
        }
        if (decisions.some((decision) => decision.requiresManualReview)) {
          return this.setStatus(job, "waiting_manual_review", { warnings: [...job.warnings, warning("Source policy requires manual review before acquisition.")] });
        }

        job = await this.save({ ...job, status: "acquiring", attempt: job.attempt + 1, updatedAt: new Date().toISOString() });
        this.publish(job, "acquiring-started");
        await this.dependencies.acquisitionExecution.execute(job);
        job = (await this.dependencies.jobRepository.get(job.id)) ?? job;
        if (job.status === "cancelled") return job;

        job = await this.setStatus(job, "reviewing");
        const review = await this.dependencies.qualityReview.review({ projectId: job.projectId, territoryId: job.territoryId, requirements: job.requirements });
        job = await this.save({ ...job, lastQuality: review, warnings: [...job.warnings, ...toWarnings(review.warnings)] });
        this.publish(job, "quality-reviewed", review);
        if (review.sufficient) return this.setStatus(job, "completed");
        if (review.manualReviewRequired) return this.setStatus(job, "waiting_manual_review", { warnings: [...job.warnings, warning("Quality review requires manual confirmation.")] });
        if (job.attempt < job.maxAttempts) await this.dependencies.sleep!(backoff(job.attempt));
      }
      return this.setStatus(job, job.ingestionRunIds.length ? "partial" : "failed", { warnings: [...job.warnings, warning("Maximum acquisition attempts exhausted.")] });
    } catch (error) {
      if (isAbort(error)) return this.setStatus(job, "cancelled", { errors: [...job.errors, errorRecord("AGENT_CANCELLED", error)] });
      return this.setStatus(job, "failed", { errors: [...job.errors, errorRecord("AGENT_FAILED", error)] });
    }
  }

  private async setStatus(job: DataAcquisitionJob, status: AgentJobStatus, patch: Partial<DataAcquisitionJob> = {}): Promise<DataAcquisitionJob> {
    return this.save({ ...job, ...patch, status, updatedAt: new Date().toISOString() });
  }

  private async save(job: DataAcquisitionJob): Promise<DataAcquisitionJob> {
    await this.dependencies.jobRepository.update(job);
    this.publish(job, "job-state", { status: job.status });
    return job;
  }

  private publish(job: DataAcquisitionJob, type: string, payload: unknown = undefined): void {
    this.bus.publish({ jobId: job.id, sender: "orchestrator", type, payload });
    this.logger.emit({ timestamp: new Date().toISOString(), level: job.status === "failed" ? "error" : job.status === "waiting_manual_review" ? "warning" : "info", operation: "agent_job", projectId: job.projectId, territoryId: job.territoryId, jobId: job.id, message: type, details: { status: job.status, attempt: job.attempt, maxAttempts: job.maxAttempts } });
  }
}

function createJob(input: StartAcquisitionInput): DataAcquisitionJob {
  const now = new Date().toISOString();
  const requestedDomains = unique(input.requestedDomains);
  return {
    id: `acquisition:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    projectId: input.projectId,
    territoryId: input.territory.id,
    territory: input.territory,
    requestedDomains,
    requirements: input.requirements ?? requestedDomains.map((domain) => ({ domain, required: true })),
    status: "created",
    attempt: 0,
    maxAttempts: Math.max(1, Math.floor(input.maxAttempts ?? 3)),
    decisions: [],
    ingestionRunIds: [],
    sourceRetryCounts: {},
    maxSourceRetries: Math.max(1, Math.floor(input.maxSourceRetries ?? 2)),
    createdAt: now,
    updatedAt: now,
    errors: [],
    warnings: [],
  };
}

function restrictRetryExhausted(decisions: DataAcquisitionJob["decisions"], retries: Record<string, number>, maxRetries: number): DataAcquisitionJob["decisions"] {
  return decisions.map((decision) => ({
    ...decision,
    selectedSourceIds: decision.selectedSourceIds.filter((sourceId) => (retries[sourceId] ?? 0) < maxRetries),
    fallbackSourceIds: decision.fallbackSourceIds.filter((sourceId) => (retries[sourceId] ?? 0) < maxRetries),
  }));
}

function withStatus(job: DataAcquisitionJob, status: AgentJobStatus, patch: Partial<DataAcquisitionJob>): DataAcquisitionJob {
  return { ...job, ...patch, status, updatedAt: new Date().toISOString() };
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function toWarnings(messages: string[]): DataHubWarning[] { return messages.map((message) => ({ code: "AGENT_REVIEW", message })); }
function warning(message: string): DataHubWarning { return { code: "AGENT_REVIEW", message }; }
function backoff(attempt: number): number { return Math.min(30_000, 250 * (2 ** Math.max(0, attempt - 1))); }
function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}
function isAbort(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("cancel")); }
function abortError(): Error { const error = new Error("Acquisition cancelled."); error.name = "AbortError"; return error; }
function errorRecord(code: string, error: unknown): DataHubError { return { code, message: error instanceof Error ? error.message : String(error), recoverable: false }; }
