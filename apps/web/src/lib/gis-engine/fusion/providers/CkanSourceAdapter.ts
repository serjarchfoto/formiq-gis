import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult } from "../types";
import { assertOk, ensureAbort, ExternalFetcher, readResponse } from "./externalAdapterUtils";

export interface CkanSourceAdapterOptions {
  endpoint?: string;
  query?: string;
  resourceFormat?: string;
  rows?: number;
  fetcher?: ExternalFetcher;
}

/** CKAN is a catalog connector. It deliberately emits no canonical geometry. */
export class CkanSourceAdapter implements SourceAdapter {
  readonly source = "ckan" as const;
  readonly version = "ckan-v1";
  private readonly options: Required<Pick<CkanSourceAdapterOptions, "endpoint" | "rows">> & CkanSourceAdapterOptions;

  constructor(options: CkanSourceAdapterOptions = {}) { this.options = { endpoint: "/api/data/ckan", rows: 50, ...options }; }

  async describeCapabilities(): Promise<Record<string, unknown>> {
    return { sourceType: "ckan", kind: "catalog", supportedDomains: [], supportsBBox: false, supportsPagination: true, authRequired: false, limits: { rows: this.options.rows }, geometrySource: false };
  }

  async resolveResourceEndpoints(records: Array<Record<string, unknown>>): Promise<Array<{ url: string; format?: string; name?: string }>> {
    return records.flatMap((record) => {
      const resources = Array.isArray(record.resources) ? record.resources : [record];
      return resources.flatMap((resource) => {
        if (!resource || typeof resource !== "object" || typeof (resource as { url?: unknown }).url !== "string") return [];
        const item = resource as { url: string; format?: unknown; name?: unknown };
        return [{ url: item.url, format: typeof item.format === "string" ? item.format : undefined, name: typeof item.name === "string" ? item.name : undefined }];
      });
    });
  }

  async search(input: { query?: string; bbox?: number[]; signal?: AbortSignal } = {}): Promise<unknown> {
    const params = { q: input.query ?? this.options.query ?? "", rows: String(this.options.rows), bbox: input.bbox?.join(",") };
    const url = withQuery(this.options.endpoint, params);
    ensureAbort(input.signal);
    const response = await (this.options.fetcher ?? fetch)(url, { signal: input.signal, headers: { Accept: "application/json" } });
    assertOk(response, this.source);
    return readResponse(response);
  }

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    return { source: this.source, version: this.version, features: [], metadata: raw.metadata };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const value = await this.search({ bbox: [bounds.west, bounds.south, bounds.east, bounds.north], signal });
    const records = extractCkanRecords(value).filter((record) => !this.options.resourceFormat || String(record.format ?? record.mimetype ?? "").toLowerCase().includes(this.options.resourceFormat.toLowerCase()));
    const resourceEndpoints = await this.resolveResourceEndpoints(records);
    return { source: this.source, version: this.version, payload: { format: "catalog", catalogType: "ckan", records }, metadata: { status: "ready", catalog: true, resourceCount: records.length, resourceEndpoints: resourceEndpoints.length, geometrySource: false } };
  }
}

function extractCkanRecords(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const result = (value as { result?: { results?: unknown[] } }).result;
  return Array.isArray(result?.results) ? result.results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function withQuery(endpoint: string, params: Record<string, string | undefined>): string {
  const url = new URL(endpoint, "http://formiq.local");
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) url.searchParams.set(key, value); });
  return url.origin === "http://formiq.local" ? `${url.pathname}${url.search}` : url.toString();
}
