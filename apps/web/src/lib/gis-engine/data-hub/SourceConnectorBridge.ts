import type { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import type { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import type { DataSourceStatus } from "@/lib/gis-engine/data-source/types";
import type { DataSourceKind } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";
import type { CanonicalDomain, IngestionErrorCode, SourceFetchEnvelope } from "./types";

export class SourceConnectorError extends Error {
  constructor(
    readonly code: IngestionErrorCode,
    message: string,
    readonly sourceId: string,
    readonly recoverable = true,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "SourceConnectorError";
  }
}

/** Transitional raw bridge over existing registered IDataSource wrappers. */
export class SourceConnectorBridge {
  constructor(
    private readonly sourceRegistry: SourceRegistry,
    private readonly dataSourceEngine: DataSourceEngine
  ) {}

  async fetch(input: {
    sourceId: DataSourceKind;
    domain: CanonicalDomain;
    bounds: BoundingBox;
    forceRefresh?: boolean;
    signal?: AbortSignal;
  }): Promise<SourceFetchEnvelope> {
    throwIfAborted(input.signal, input.sourceId);
    const source = this.sourceRegistry.require(input.sourceId);

    try {
      const raw = await source.fetchRaw?.({
        bbox: input.bounds,
        signal: input.signal,
        forceRefresh: input.forceRefresh,
      });
      if (raw) {
        return {
          sourceId: input.sourceId,
          domain: input.domain,
          rawPayload: raw.payload,
          metadata: {
            sourceName: source.name,
            sourceMode: source.mode,
            sourceType: input.sourceId === "osm" ? "osm" : input.sourceId,
            ...(input.sourceId === "osm" ? { inputCrs: "EPSG:4326" } : {}),
            adapterVersion: raw.version,
            ...(raw.metadata ?? {}),
          },
          usedLegacyNormalization: false,
        };
      }

      const result = await this.dataSourceEngine.fetchSource(input.sourceId, {
        bbox: input.bounds,
        signal: input.signal,
        forceRefresh: input.forceRefresh,
      });
      assertUsableStatus(result.status, input.sourceId, result.metadata.message);
      return {
        sourceId: input.sourceId,
        domain: input.domain,
        rawPayload: result.adapterResult,
        metadata: {
          sourceName: source.name,
          sourceMode: source.mode,
          sourceType: input.sourceId === "osm" ? "osm" : input.sourceId,
          adapterVersion: result.adapterResult.version,
          status: result.status,
          warning: "LEGACY_NORMALIZED_FALLBACK: adapter does not expose fetchRaw().",
          ...result.metadata,
        },
        legacyNormalizedPayload: result.adapterResult,
        usedLegacyNormalization: true,
      };
    } catch (error) {
      if (error instanceof SourceConnectorError) throw error;
      throw classifySourceError(error, input.sourceId);
    }
  }
}

function assertUsableStatus(status: DataSourceStatus, sourceId: string, message: unknown): void {
  if (status === "ready") return;
  const text = typeof message === "string" && message ? message : `Source "${sourceId}" returned status "${status}".`;
  if (status === "rate-limited") throw new SourceConnectorError("SOURCE_RATE_LIMITED", text, sourceId);
  if (status === "not-configured") throw new SourceConnectorError("SOURCE_AUTH_REQUIRED", text, sourceId);
  throw new SourceConnectorError("SOURCE_UNAVAILABLE", text, sourceId);
}

function classifySourceError(error: unknown, sourceId: string): SourceConnectorError {
  if (isAbortError(error)) return new SourceConnectorError("INGESTION_ABORTED", "Ingestion was aborted.", sourceId, false, { cause: error });
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : `Source "${sourceId}" failed.`;
  if (status === 429) return new SourceConnectorError("SOURCE_RATE_LIMITED", message, sourceId, true, { cause: error });
  if (status === 401 || status === 403) return new SourceConnectorError("SOURCE_AUTH_REQUIRED", message, sourceId, true, { cause: error });
  if (status === 408 || /timeout|timed out/i.test(message)) {
    return new SourceConnectorError("SOURCE_TIMEOUT", message, sourceId, true, { cause: error });
  }
  return new SourceConnectorError("SOURCE_UNAVAILABLE", message, sourceId, true, { cause: error });
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function throwIfAborted(signal: AbortSignal | undefined, sourceId: string): void {
  if (signal?.aborted) throw new SourceConnectorError("INGESTION_ABORTED", "Ingestion was aborted.", sourceId, false);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError" ||
    error instanceof Error && error.name === "AbortError";
}
