import type { DataHubApi } from "../DataHub";
import type { AgentBusApi, AgentExecutionBackend, AgentJobRepository, AcquisitionExecutionAgent as AcquisitionExecutionAgentApi, DataAcquisitionJob } from "./types";

export class DataHubAcquisitionExecutionAgent implements AcquisitionExecutionAgentApi {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly dependencies: { dataHub: DataHubApi; jobRepository: AgentJobRepository; bus?: AgentBusApi }) {}

  async execute(job: DataAcquisitionJob): Promise<void> {
    if (!job.territory) throw new Error("Acquisition job has no territory reference.");
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      const preferredSourceIds = [...new Set(job.decisions.flatMap((decision) => decision.selectedSourceIds))];
      const result = await this.dependencies.dataHub.refreshTerritory({
        projectId: job.projectId,
        territory: job.territory,
        domains: job.requestedDomains,
        preferredSourceIds,
      }, {
        signal: controller.signal,
        onProgress: (event) => this.dependencies.bus?.publish({ jobId: job.id, sender: "executor", type: "ingestion-progress", payload: event }),
      });
      const sourceRetryCounts = { ...(job.sourceRetryCounts ?? {}) };
      for (const error of result.ingestionRun.errors) {
        if (error.sourceId) sourceRetryCounts[error.sourceId] = (sourceRetryCounts[error.sourceId] ?? 0) + 1;
      }
      const updated: DataAcquisitionJob = {
        ...job,
        ingestionRunIds: [...new Set([...job.ingestionRunIds, result.ingestionRun.id])],
        sourceRetryCounts,
        warnings: [...job.warnings, ...result.ingestionRun.warnings],
        errors: [...job.errors, ...result.ingestionRun.errors],
        lastQuality: job.lastQuality,
        updatedAt: new Date().toISOString(),
      };
      await this.dependencies.jobRepository.update(updated);
      this.dependencies.bus?.publish({ jobId: job.id, sender: "executor", type: "acquisition-finished", payload: { status: result.ingestionRun.status, ingestionRunId: result.ingestionRun.id } });
    } catch (error) {
      if (controller.signal.aborted) throw abortError();
      throw error;
    } finally {
      this.controllers.delete(job.id);
    }
  }

  async cancel(jobId: string): Promise<void> {
    this.controllers.get(jobId)?.abort();
  }
}

export type { AgentExecutionBackend };

function abortError(): Error {
  const error = new Error("Acquisition was cancelled.");
  error.name = "AbortError";
  return error;
}
