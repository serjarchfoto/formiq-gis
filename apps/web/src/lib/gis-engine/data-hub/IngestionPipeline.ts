import type { DataSourceHealth } from "@/lib/gis-engine/data-source/types";
import type { DataSourceKind } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";
import { SourceConnectorBridge, SourceConnectorError } from "./SourceConnectorBridge";
import { SourcePolicyEngine } from "./source-policy/SourcePolicyEngine";
import type { SourceCandidate, SourceSelectionDecision } from "./source-policy/types";
import type {
  CanonicalDomain,
  DataHubError,
  DataHubWarning,
  IngestionErrorCode,
  IngestionPipelineApi,
  IngestionPipelineDependencies,
  IngestionProgressEvent,
  IngestionRun,
  NormalizedSourceDataset,
  RawDataRecord,
  RefreshTerritoryRequest,
  SourceFetchEnvelope,
} from "./types";

interface SourcePlan {
  domain: CanonicalDomain;
  sourceIds: DataSourceKind[];
  decision: SourceSelectionDecision;
}

export class IngestionPipeline implements IngestionPipelineApi {
  private readonly bridge: SourceConnectorBridge;
  private readonly sourcePolicyEngine: SourcePolicyEngine;

  constructor(private readonly dependencies: IngestionPipelineDependencies) {
    this.bridge = new SourceConnectorBridge(dependencies.sourceRegistry, dependencies.dataSourceEngine);
    this.sourcePolicyEngine = dependencies.sourcePolicyEngine ?? new SourcePolicyEngine();
  }

  async run(
    request: RefreshTerritoryRequest,
    options: {
      onProgress?: (event: IngestionProgressEvent) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<{ run: IngestionRun; normalized: NormalizedSourceDataset[] }> {
    let run = createRun(request);
    await this.dependencies.ingestionRunRepository.create(run);

    try {
      throwIfAborted(options.signal);
      const plan = createSourcePlan(request, this.dependencies.sourceRegistry.list(), this.sourcePolicyEngine);
      run = await this.updateRun({
        ...run,
        status: "running",
        sourceIds: [...new Set(plan.flatMap((item) => item.sourceIds))],
        sourcePolicyDecisions: plan.map((item) => item.decision),
      });
      emit(options, run.id, "planning", 1, 1, undefined, undefined, `Planned ${plan.length} domains.`);

      const uniqueSourceIds = [...new Set(plan.flatMap((item) => item.sourceIds))];
      const health = new Map<DataSourceKind, DataSourceHealth>();
      for (let index = 0; index < uniqueSourceIds.length; index += 1) {
        throwIfAborted(options.signal);
        const sourceId = uniqueSourceIds[index]!;
        try {
          health.set(sourceId, await this.dependencies.sourceHealthMonitor.check(sourceId));
        } catch (error) {
          health.set(sourceId, {
            source: sourceId,
            status: "offline",
            checkedAt: new Date().toISOString(),
            message: error instanceof Error ? error.message : "Health check failed.",
          });
        }
        emit(options, run.id, "health_check", index + 1, uniqueSourceIds.length, undefined, sourceId);
      }

      const normalized: NormalizedSourceDataset[] = [];
      const completedDomains = new Set<CanonicalDomain>();
      const bounds = toBoundingBox(request.territory.bbox);
      const totalAttempts = plan.reduce((total, item) => total + item.sourceIds.length, 0);
      let completedAttempts = 0;

      for (const item of plan) {
        let domainComplete = false;
        for (const sourceId of item.sourceIds) {
          throwIfAborted(options.signal);
          completedAttempts += 1;
          const state = health.get(sourceId);
          if (!state || state.status !== "ready") {
            run = await this.recordError(run, healthError(item.domain, sourceId, state));
            emit(options, run.id, "fetching", completedAttempts, totalAttempts, item.domain, sourceId, state?.message);
            continue;
          }

          emit(options, run.id, "fetching", completedAttempts - 1, totalAttempts, item.domain, sourceId);
          let envelope: SourceFetchEnvelope;
          try {
            envelope = await this.bridge.fetch({
              sourceId,
              domain: item.domain,
              bounds,
              forceRefresh: request.forceRefresh,
              signal: options.signal,
            });
          } catch (error) {
            if (isAbort(error)) throw error;
            run = await this.recordError(run, sourceError(item.domain, sourceId, error));
            emit(options, run.id, "fetching", completedAttempts, totalAttempts, item.domain, sourceId);
            continue;
          }

          const rawRecord = createRawRecord(run, request, item.domain, envelope);
          try {
            await this.dependencies.rawRepository.save(rawRecord);
            run = await this.updateRun({ ...run, rawRecordIds: [...run.rawRecordIds, rawRecord.id] });
          } catch (error) {
            run = await this.recordError(run, {
              code: "RAW_PERSIST_FAILED",
              message: error instanceof Error ? error.message : "Raw response could not be persisted.",
              sourceId,
              domain: item.domain,
              recoverable: true,
            });
            continue;
          }
          emit(options, run.id, "raw_persisted", completedAttempts, totalAttempts, item.domain, sourceId);

          try {
            emit(options, run.id, "normalizing", completedAttempts - 1, totalAttempts, item.domain, sourceId);
            const dataset = ensureLegacyAuditTrail(
              await this.dependencies.normalizationPipeline.normalize({
                envelope,
                rawRecord,
                signal: options.signal,
              }),
              envelope,
              rawRecord
            );
            normalized.push(dataset);
            const normalizationWarnings = dataset.issues
              .filter((issue) => issue.severity !== "info")
              .map<DataHubWarning>((issue) => ({
                code: issue.code,
                message: issue.message,
                sourceId,
                domain: item.domain,
              }));
            run = normalizationWarnings.length
              ? await this.updateRun({ ...run, warnings: [...run.warnings, ...normalizationWarnings] })
              : run;
            emit(options, run.id, "normalizing", completedAttempts, totalAttempts, item.domain, sourceId);

            if (dataset.features.length > 0) {
              completedDomains.add(item.domain);
              domainComplete = true;
              break;
            }
            run = await this.recordWarning(run, {
              code: "DOMAIN_PARTIAL",
              message: `Source "${sourceId}" returned no ${item.domain} features; trying fallback.`,
              sourceId,
              domain: item.domain,
            });
          } catch (error) {
            if (isAbort(error)) throw error;
            run = await this.recordError(run, {
              code: "SOURCE_INVALID_RESPONSE",
              message: error instanceof Error ? error.message : "Normalization failed.",
              sourceId,
              domain: item.domain,
              recoverable: true,
            });
          }
        }

        if (!domainComplete) {
          run = await this.recordWarning(run, {
            code: "DOMAIN_PARTIAL",
            message: `No usable dataset was produced for domain "${item.domain}".`,
            domain: item.domain,
          });
        }
      }

      const missingDomains = request.domains.filter((domain) => !completedDomains.has(domain));
      if (normalized.length === 0 || completedDomains.size === 0) {
        run = await this.recordError(run, {
          code: "ALL_SOURCES_FAILED",
          message: "All planned sources failed or returned no usable data.",
          recoverable: false,
        });
      }
      const finalStatus: IngestionRun["status"] = completedDomains.size === 0
        ? "failed"
        : missingDomains.length > 0 || run.errors.length > 0 || run.warnings.length > 0
          ? "partial"
          : "completed";
      run = await this.updateRun({ ...run, status: finalStatus, finishedAt: new Date().toISOString() });
      emit(
        options,
        run.id,
        finalStatus === "failed" ? "failed" : "completed",
        completedDomains.size,
        request.domains.length,
        undefined,
        undefined,
        `Ingestion ${finalStatus}.`
      );
      return { run, normalized };
    } catch (error) {
      if (isAbort(error) || options.signal?.aborted) {
        run = await this.recordError(run, {
          code: "INGESTION_ABORTED",
          message: "Ingestion was aborted.",
          recoverable: false,
        });
        run = await this.updateRun({ ...run, status: "cancelled", finishedAt: new Date().toISOString() });
        emit(options, run.id, "failed", 0, request.domains.length, undefined, undefined, "Ingestion aborted.");
        throw new IngestionPipelineError("INGESTION_ABORTED", "Ingestion was aborted.", run, { cause: error });
      }
      run = await this.recordError(run, {
        code: "ALL_SOURCES_FAILED",
        message: error instanceof Error ? error.message : "Ingestion failed.",
        recoverable: false,
      });
      run = await this.updateRun({ ...run, status: "failed", finishedAt: new Date().toISOString() });
      emit(options, run.id, "failed", 0, request.domains.length, undefined, undefined, "Ingestion failed.");
      return { run, normalized: [] };
    }
  }

  private updateRun(run: IngestionRun): Promise<IngestionRun> {
    return this.dependencies.ingestionRunRepository.update(run).then(() => run);
  }

  private recordError(run: IngestionRun, error: DataHubError): Promise<IngestionRun> {
    if (run.errors.some((item) =>
      item.code === error.code && item.sourceId === error.sourceId && item.domain === error.domain
    )) return Promise.resolve(run);
    return this.updateRun({ ...run, errors: [...run.errors, error] });
  }

  private recordWarning(run: IngestionRun, warning: DataHubWarning): Promise<IngestionRun> {
    return this.updateRun({ ...run, warnings: [...run.warnings, warning] });
  }
}

export class IngestionPipelineError extends Error {
  constructor(
    readonly code: IngestionErrorCode,
    message: string,
    readonly run: IngestionRun,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "IngestionPipelineError";
  }
}

function createRun(request: RefreshTerritoryRequest): IngestionRun {
  return {
    id: createId("ingestion"),
    projectId: request.projectId,
    territoryId: request.territory.id,
    requestedDomains: [...request.domains],
    sourceIds: [],
    status: "created",
    startedAt: new Date().toISOString(),
    rawRecordIds: [],
    errors: [],
    warnings: [],
    sourcePolicyDecisions: [],
  };
}

function createSourcePlan(
  request: RefreshTerritoryRequest,
  registered: ReturnType<IngestionPipelineDependencies["sourceRegistry"]["list"]>,
  policyEngine: SourcePolicyEngine
): SourcePlan[] {
  const available = new Set(registered.map((source) => source.id));
  const excluded = new Set(request.excludedSourceIds ?? []);

  return [...new Set(request.domains)].map((domain) => {
    const candidates: SourceCandidate[] = registered
      .filter((source) => supportsDomain(source.id, domain) && !excluded.has(source.id))
      .map((source) => ({
        sourceId: source.id,
        domain,
        available: source.status !== "offline" && source.status !== "error" && source.status !== "rate-limited",
        coverageKnown: false,
        licenseAllowed: true,
        automationAllowed: true,
      }));
    const decision = policyEngine.decide({ domain, candidates, context: { territoryId: request.territory.id, automationRequired: true } });
    const preferred = (request.preferredSourceIds ?? []).filter((sourceId) =>
      available.has(sourceId as DataSourceKind) &&
      !excluded.has(sourceId) &&
      decision.selectedSourceIds.includes(sourceId)
    );
    // Fetch order follows the registry's factual availability order. The
    // decision itself remains score-ordered and is persisted for audit/UI;
    // ordering here preserves deterministic fallback behaviour for adapters.
    const policyOrdered = registered
      .map((source) => source.id)
      .filter((sourceId) => decision.selectedSourceIds.includes(sourceId));
    const ordered = [...preferred, ...policyOrdered]
      .filter((sourceId, index, values) => values.indexOf(sourceId) === index)
      .map((sourceId) => sourceId as DataSourceKind);
    return { domain, sourceIds: ordered, decision: { ...decision, selectedSourceIds: ordered } };
  });
}

function supportsDomain(sourceId: DataSourceKind, domain: CanonicalDomain): boolean {
  // Catalog adapters expose metadata/assets only; they are not canonical
  // geometry providers and therefore never enter vector ingestion plans.
  if (sourceId === "ckan" || sourceId === "stac") return false;
  if (sourceId === "osm") return domain !== "imagery" && domain !== "terrain";
  if (sourceId === "microsoft-buildings" || sourceId === "local-buildings") return domain === "building";
  if (sourceId === "overture") return domain === "building" || domain === "poi" || domain === "road";
  if (sourceId === "wikidata") return domain === "poi" || domain === "transport_stop";
  if (sourceId === "gtfs") return domain === "transport_stop";
  if (sourceId === "copernicus-dem") return domain === "terrain";
  if (sourceId === "city-geojson") return domain !== "terrain" && domain !== "imagery";
  return true;
}

function createRawRecord(
  run: IngestionRun,
  request: RefreshTerritoryRequest,
  domain: CanonicalDomain,
  envelope: SourceFetchEnvelope
): RawDataRecord {
  return {
    id: createId("raw"),
    ingestionRunId: run.id,
    projectId: request.projectId,
    territoryId: request.territory.id,
    sourceId: envelope.sourceId,
    domain,
    receivedAt: new Date().toISOString(),
    sourceMetadata: {
      ...envelope.metadata,
      usedLegacyNormalization: envelope.usedLegacyNormalization,
    },
    payload: envelope.rawPayload,
  };
}

function ensureLegacyAuditTrail(
  dataset: NormalizedSourceDataset,
  envelope: SourceFetchEnvelope,
  rawRecord: RawDataRecord
): NormalizedSourceDataset {
  if (!envelope.usedLegacyNormalization) return dataset;
  const warning: DataHubWarning = {
    code: "LEGACY_NORMALIZED_FALLBACK",
    message: `Source "${envelope.sourceId}" did not expose raw payload; legacy normalized data was used.`,
    sourceId: envelope.sourceId,
    domain: envelope.domain,
  };
  return {
    ...dataset,
    features: dataset.features.map((feature) => ({
      ...feature,
      provenance: {
        ...feature.provenance,
        acquisitionMethod: "legacy",
        rawRecordId: feature.provenance.rawRecordId ?? rawRecord.id,
        transformationSteps: [...feature.provenance.transformationSteps, "legacy-normalized-fallback"],
      },
    })),
    issues: [...dataset.issues, { severity: "warning", ...warning }],
  };
}

function healthError(
  domain: CanonicalDomain,
  sourceId: DataSourceKind,
  health: DataSourceHealth | undefined
): DataHubError {
  const code: IngestionErrorCode = health?.status === "rate-limited"
    ? "SOURCE_RATE_LIMITED"
    : health?.status === "not-configured" && /auth|token|key/i.test(health.message ?? "")
      ? "SOURCE_AUTH_REQUIRED"
      : "SOURCE_UNAVAILABLE";
  return {
    code,
    message: health?.message ?? `Source "${sourceId}" is unavailable.`,
    sourceId,
    domain,
    recoverable: true,
  };
}

function sourceError(domain: CanonicalDomain, sourceId: string, error: unknown): DataHubError {
  if (error instanceof SourceConnectorError) {
    return { code: error.code, message: error.message, sourceId, domain, recoverable: error.recoverable };
  }
  return {
    code: "SOURCE_UNAVAILABLE",
    message: error instanceof Error ? error.message : `Source "${sourceId}" failed.`,
    sourceId,
    domain,
    recoverable: true,
  };
}

function emit(
  options: { onProgress?: (event: IngestionProgressEvent) => void },
  runId: string,
  stage: IngestionProgressEvent["stage"],
  completed: number,
  total: number,
  domain?: CanonicalDomain,
  sourceId?: string,
  message?: string
): void {
  options.onProgress?.({ runId, stage, domain, sourceId, completed, total, message });
}

function toBoundingBox(bbox: [number, number, number, number]): BoundingBox {
  return { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Ingestion was aborted.", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof SourceConnectorError && error.code === "INGESTION_ABORTED" ||
    error instanceof DOMException && error.name === "AbortError" ||
    error instanceof Error && error.name === "AbortError";
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
