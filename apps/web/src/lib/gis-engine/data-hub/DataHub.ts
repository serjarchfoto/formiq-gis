import type { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import type {
  CanonicalFusionServiceApi,
  CanonicalQuery,
  CanonicalQueryResult,
  CanonicalSnapshot,
  CanonicalSnapshotBuilderApi,
  DataHubAnalysisContext,
  DataHubQueryServiceApi,
  IngestionPipelineApi,
  QualityEngineApi,
  QualityReport,
  RefreshTerritoryRequest,
  RefreshTerritoryResult,
  AnalysisDataRequirement,
  RawDataRecord,
  TerritoryDataStatus,
} from "./types";
import type { IngestionRunRepository, QualityRepository, RawDataRepository } from "./repositories";
import type { DataHubLogger } from "./Observability";
import { NoopDataHubLogger } from "./Observability";

export interface DataHubApi {
  refreshTerritory(request: RefreshTerritoryRequest, options?: { onProgress?: (event: import("./types").IngestionProgressEvent) => void; signal?: AbortSignal }): Promise<RefreshTerritoryResult>;
  queryCanonical(query: CanonicalQuery): Promise<CanonicalQueryResult>;
  queryLayers(query: CanonicalQuery): Promise<CanonicalQueryResult>;
  queryAnalysisContext(input: {
    projectId: string;
    territoryId: string;
    requirements: AnalysisDataRequirement[];
  }): Promise<DataHubAnalysisContext>;
  getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null>;
  getQualityReport(input: { projectId: string; territoryId: string; snapshotId?: string }): Promise<QualityReport | null>;
  getTerritoryDataStatus(input: { projectId: string; territoryId: string }): Promise<TerritoryDataStatus>;
}

export interface DataHubDependencies {
  ingestionPipeline: IngestionPipelineApi;
  canonicalFusionService: CanonicalFusionServiceApi;
  snapshotBuilder: CanonicalSnapshotBuilderApi;
  qualityEngine: QualityEngineApi;
  queryService: DataHubQueryServiceApi;
  sourceHealthMonitor: SourceHealthMonitor;
  rawDataRepository: RawDataRepository;
  ingestionRunRepository: IngestionRunRepository;
  qualityRepository: QualityRepository;
  agentJobRepository?: { listByProject(projectId: string): Promise<Array<{ id: string; territoryId: string; status: string; updatedAt: string }>> };
  logger?: DataHubLogger;
}

/** Internal orchestration facade. UI projection intentionally remains outside this service. */
export class DataHub implements DataHubApi {
  private readonly activeRefreshes = new Map<string, Promise<RefreshTerritoryResult>>();
  private readonly logger: DataHubLogger;

  constructor(private readonly dependencies: DataHubDependencies) {
    this.logger = dependencies.logger ?? new NoopDataHubLogger();
  }

  async refreshTerritory(request: RefreshTerritoryRequest, options: { onProgress?: (event: import("./types").IngestionProgressEvent) => void; signal?: AbortSignal } = {}): Promise<RefreshTerritoryResult> {
    const key = `${request.projectId}:${request.territory.id}`;
    const active = this.activeRefreshes.get(key);
    if (active) {
      this.logger.emit({ timestamp: new Date().toISOString(), level: "info", operation: "fusion", projectId: request.projectId, territoryId: request.territory.id, message: "Joined existing territory refresh.", details: { deduplicated: true } });
      return active;
    }
    const refresh = this.performRefresh(request, options);
    this.activeRefreshes.set(key, refresh);
    try {
      return await refresh;
    } finally {
      if (this.activeRefreshes.get(key) === refresh) this.activeRefreshes.delete(key);
    }
  }

  private async performRefresh(request: RefreshTerritoryRequest, options: { onProgress?: (event: import("./types").IngestionProgressEvent) => void; signal?: AbortSignal }): Promise<RefreshTerritoryResult> {
    validateRefreshRequest(request);
    const previousSnapshot = await this.dependencies.queryService.getLatestSnapshot({
      projectId: request.projectId,
      territoryId: request.territory.id,
    });
    const ingestion = await this.dependencies.ingestionPipeline.run(request, {
      signal: options.signal,
      onProgress: (event) => {
        if (event.stage !== "completed") {
          this.logger.emit({ timestamp: new Date().toISOString(), level: event.stage === "failed" ? "error" : "debug", operation: stageOperation(event.stage), projectId: request.projectId, territoryId: request.territory.id, runId: event.runId, sourceId: event.sourceId, domain: event.domain, message: event.message ?? event.stage, details: { completed: event.completed, total: event.total } });
          options.onProgress?.(event);
        }
      },
    });
    this.logger.emit({ timestamp: new Date().toISOString(), level: "info", operation: "source_selection", projectId: request.projectId, territoryId: request.territory.id, runId: ingestion.run.id, message: "Source policy decisions recorded.", details: { decisions: ingestion.run.sourcePolicyDecisions?.length ?? 0 } });
    options.onProgress?.({ runId: ingestion.run.id, stage: "fusing", completed: 0, total: 1, message: "Building canonical fusion result." });
    const fusion = await this.dependencies.canonicalFusionService.fuse({
      projectId: request.projectId,
      territoryId: request.territory.id,
      ingestionRunId: ingestion.run.id,
      datasets: ingestion.normalized,
      previousSnapshot,
    });
    this.logger.emit({ timestamp: new Date().toISOString(), level: "info", operation: "fusion", projectId: request.projectId, territoryId: request.territory.id, runId: ingestion.run.id, message: "Canonical fusion completed.", details: { featureCount: fusion.features.length, conflictCount: fusion.conflicts.length } });
    let run = ingestion.run;
    if (fusion.warnings.length > 0) {
      run = { ...run, warnings: [...run.warnings, ...fusion.warnings] };
      await this.dependencies.ingestionRunRepository.update(run);
    }
    const snapshot = await this.dependencies.snapshotBuilder.buildAndSave({
      projectId: request.projectId,
      territoryId: request.territory.id,
      ingestionRunId: run.id,
      features: fusion.features,
      previousSnapshot,
    });
    options.onProgress?.({ runId: run.id, stage: "fusing", completed: 1, total: 1, message: "Canonical snapshot saved." });
    const rawRecords = await this.dependencies.rawDataRepository.listByRun(run.id);
    options.onProgress?.({ runId: run.id, stage: "quality", completed: 0, total: 1, message: "Evaluating data quality." });
    const quality = await this.dependencies.qualityEngine.evaluate({
      snapshot,
      territory: request.territory,
      sourceHealth: Object.fromEntries(this.dependencies.sourceHealthMonitor.getStates().map((state) => [state.source, state])),
      sourceMetadata: collectSourceMetadata(rawRecords, request.domains),
    });
    this.logger.emit({ timestamp: new Date().toISOString(), level: "info", operation: "quality", projectId: request.projectId, territoryId: request.territory.id, runId: run.id, message: "Quality report evaluated.", details: { status: quality.overallStatus, score: quality.overallScore } });
    await this.dependencies.qualityRepository.save(quality);
    options.onProgress?.({ runId: run.id, stage: "quality", completed: 1, total: 1, message: "Quality report saved." });
    const persistedRun = await this.dependencies.ingestionRunRepository.get(run.id) ?? run;
    run = { ...persistedRun, canonicalSnapshotId: snapshot.id, qualityReportId: quality.id };
    await this.dependencies.ingestionRunRepository.update(run);
    options.onProgress?.({ runId: run.id, stage: run.status === "failed" ? "failed" : "completed", completed: 1, total: 1, message: `Data Hub refresh ${run.status}.` });
    return { ingestionRun: run, snapshot, quality };
  }

  queryCanonical(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    return this.dependencies.queryService.queryCanonical(query);
  }

  queryLayers(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    return this.dependencies.queryService.queryLayers(query);
  }

  queryAnalysisContext(input: {
    projectId: string;
    territoryId: string;
    requirements: AnalysisDataRequirement[];
  }): Promise<DataHubAnalysisContext> {
    return this.dependencies.queryService.queryAnalysisContext(input);
  }

  getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null> {
    return this.dependencies.queryService.getLatestSnapshot(input);
  }

  getQualityReport(input: { projectId: string; territoryId: string; snapshotId?: string }): Promise<QualityReport | null> {
    return this.dependencies.queryService.getQualityReport(input);
  }

  async getTerritoryDataStatus(input: { projectId: string; territoryId: string }): Promise<TerritoryDataStatus> {
    const latestSnapshot = await this.getLatestSnapshot(input);
    const lastRefresh = await this.dependencies.ingestionRunRepository.getLatest(input);
    const quality = latestSnapshot ? await this.getQualityReport({ ...input, snapshotId: latestSnapshot.id }) : null;
    const jobs = await this.dependencies.agentJobRepository?.listByProject(input.projectId) ?? [];
    const activeAgentJob = jobs.filter((job) => job.territoryId === input.territoryId && ["created", "assessing", "planning", "acquiring", "reviewing"].includes(job.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const activeIngestion = lastRefresh && ["created", "running"].includes(lastRefresh.status) ? lastRefresh : null;
    const warnings = [...(lastRefresh?.warnings ?? []), ...Object.values(quality?.domains ?? {}).flatMap((domain) => (domain?.warnings ?? []).map((message) => ({ code: "QUALITY_WARNING", message, domain: domain?.domain })) )];
    this.logger.emit({ timestamp: new Date().toISOString(), level: "debug", operation: "analysis_context", projectId: input.projectId, territoryId: input.territoryId, message: "Territory data status queried.", details: { hasSnapshot: Boolean(latestSnapshot), hasQuality: Boolean(quality), activeIngestion: Boolean(activeIngestion), activeAgentJob: Boolean(activeAgentJob) } });
    return { projectId: input.projectId, territoryId: input.territoryId, latestSnapshot, lastRefresh, domainStatuses: quality?.domains ?? {}, sourceChain: lastRefresh?.sourcePolicyDecisions ?? [], quality, activeIngestion, activeAgentJob: activeAgentJob ? { id: activeAgentJob.id, status: activeAgentJob.status, updatedAt: activeAgentJob.updatedAt } : null, warnings };
  }
}

function stageOperation(stage: import("./types").IngestionProgressEvent["stage"]): import("./Observability").DataHubLogEvent["operation"] {
  if (stage === "planning" || stage === "health_check") return "source_selection";
  if (stage === "fetching") return "source_fetch";
  if (stage === "raw_persisted") return "raw_persist";
  if (stage === "normalizing") return "normalization";
  if (stage === "fusing") return "fusion";
  return "quality";
}

function validateRefreshRequest(request: RefreshTerritoryRequest): void {
  if (request.projectId !== request.territory.projectId) throw new Error("Refresh request project does not match territory project.");
  if (request.domains.length === 0) throw new Error("Refresh request must include at least one domain.");
  const [west, south, east, north] = request.territory.bbox;
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new Error("Refresh request contains an invalid territory bbox.");
  }
}

function collectSourceMetadata(records: RawDataRecord[], requestedDomains: RefreshTerritoryRequest["domains"]): Record<string, unknown> {
  const bySource = Object.fromEntries(records.map((record) => [record.sourceId, record.sourceMetadata]));
  const evidence = records.reduce<Record<string, Record<string, unknown>>>((result, record) => {
    for (const key of ["coverageByDomain", "freshnessMaxAgeDaysBySource", "reliabilityBySource"]) {
      const value = record.sourceMetadata[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = { ...(result[key] ?? {}), ...(value as Record<string, unknown>) };
      }
    }
    const reliability = record.sourceMetadata.reliabilityScore;
    if (typeof reliability === "number" && Number.isFinite(reliability)) {
      result.reliabilityBySource = { ...(result.reliabilityBySource ?? {}), [record.sourceId]: reliability };
    }
    const coverage = record.sourceMetadata.coverageScore;
    if (typeof coverage === "number" && Number.isFinite(coverage)) {
      result.coverageByDomain = { ...(result.coverageByDomain ?? {}), [record.domain]: { score: coverage, measurement: "estimated" } };
    }
    return result;
  }, {});
  return { requestedDomains, bySource, ...evidence };
}
