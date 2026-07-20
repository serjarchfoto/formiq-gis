import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult } from "../types";
import { assertOk, ensureAbort, ExternalFetcher, readResponse } from "./externalAdapterUtils";

export interface StacSourceAdapterOptions {
  endpoint?: string;
  collections?: string[];
  datetime?: string;
  limit?: number;
  fetcher?: ExternalFetcher;
}

/** STAC is an asset catalog. Raster assets are passed as metadata only. */
export class StacSourceAdapter implements SourceAdapter {
  readonly source = "stac" as const;
  readonly version = "stac-v1";
  private readonly options: Required<Pick<StacSourceAdapterOptions, "endpoint" | "limit">> & StacSourceAdapterOptions;

  constructor(options: StacSourceAdapterOptions = {}) { this.options = { endpoint: "/api/data/stac", limit: 100, ...options }; }

  async describeCapabilities(): Promise<Record<string, unknown>> {
    return { sourceType: "stac", kind: "catalog", supportedDomains: ["imagery", "terrain"], supportsBBox: true, supportsPagination: true, crs: "asset-reported", authRequired: false, limits: { limit: this.options.limit }, geometrySource: false, assetsRequireExplicitDownload: true };
  }

  async listAssets(items: Array<Record<string, unknown>>): Promise<Array<{ href: string; type?: string; datetime?: string; license?: string }>> {
    return items.flatMap((item) => {
      const assets = item.assets && typeof item.assets === "object" ? Object.values(item.assets as Record<string, unknown>) : [];
      return assets.flatMap((asset) => {
        if (!asset || typeof asset !== "object" || typeof (asset as { href?: unknown }).href !== "string") return [];
        const value = asset as { href: string; type?: unknown; datetime?: unknown; license?: unknown };
        return [{ href: value.href, type: typeof value.type === "string" ? value.type : undefined, datetime: typeof value.datetime === "string" ? value.datetime : undefined, license: typeof value.license === "string" ? value.license : undefined }];
      });
    });
  }

  async search(input: { bounds?: number[]; datetime?: string; signal?: AbortSignal } = {}): Promise<unknown> {
    const url = new URL(this.options.endpoint, "http://formiq.local");
    if (input.bounds) url.searchParams.set("bbox", input.bounds.join(","));
    if (input.datetime ?? this.options.datetime) url.searchParams.set("datetime", input.datetime ?? this.options.datetime!);
    if (this.options.collections?.length) url.searchParams.set("collections", this.options.collections.join(","));
    url.searchParams.set("limit", String(this.options.limit));
    ensureAbort(input.signal);
    const target = url.origin === "http://formiq.local" ? `${url.pathname}${url.search}` : url.toString();
    const response = await (this.options.fetcher ?? fetch)(target, { signal: input.signal, headers: { Accept: "application/geo+json, application/json" } });
    assertOk(response, this.source);
    return readResponse(response);
  }

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    return { source: this.source, version: this.version, features: [], metadata: raw.metadata };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const value = await this.search({ bounds: [bounds.west, bounds.south, bounds.east, bounds.north], signal });
    const records = extractStacItems(value);
    const assets = await this.listAssets(records);
    return { source: this.source, version: this.version, payload: { format: "catalog", catalogType: "stac", records }, metadata: { status: "ready", catalog: true, assetCount: assets.length, geometrySource: false } };
  }
}

function extractStacItems(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const features = (value as { features?: unknown[] }).features;
  return Array.isArray(features) ? features.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}
