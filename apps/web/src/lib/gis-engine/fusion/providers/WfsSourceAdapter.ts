import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult } from "../types";
import { assertOk, ensureAbort, ExternalFetcher, formatBbox, normalizeCollection, readResponse, toGeoJsonPayload } from "./externalAdapterUtils";

export interface WfsSourceAdapterOptions {
  endpoint?: string;
  typeName?: string;
  outputFormat?: string;
  srsName?: string;
  pageSize?: number;
  maxPages?: number;
  fetcher?: ExternalFetcher;
}

export class WfsSourceAdapter implements SourceAdapter {
  readonly source = "wfs" as const;
  readonly version = "wfs-v1";
  private readonly options: Required<Pick<WfsSourceAdapterOptions, "endpoint" | "outputFormat" | "pageSize" | "maxPages">> & WfsSourceAdapterOptions;

  constructor(options: WfsSourceAdapterOptions = {}) {
    this.options = { endpoint: "/api/data/wfs", outputFormat: "application/json", pageSize: 1000, maxPages: 20, ...options };
  }

  async describeCapabilities(): Promise<Record<string, unknown>> {
    return { sourceType: "wfs", kind: "vector", supportedDomains: ["building", "road", "green_area", "waterbody", "boundary", "parcel"], supportsBBox: true, supportsPagination: true, crs: this.options.srsName ?? "source-reported", authRequired: false, limits: { pageSize: this.options.pageSize, maxPages: this.options.maxPages } };
  }

  async getCapabilities(signal?: AbortSignal): Promise<unknown> {
    return this.request({ service: "WFS", request: "GetCapabilities", version: "2.0.0" }, signal);
  }

  async describeFeatureType(typeName = this.options.typeName, signal?: AbortSignal): Promise<unknown> {
    return this.request({ service: "WFS", request: "DescribeFeatureType", version: "2.0.0", typeNames: typeName }, signal);
  }

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    const collection = raw.payload.format === "geojson" ? { type: "FeatureCollection", features: raw.payload.features } as FeatureCollection<Geometry, GeoJsonProperties> : emptyCollection();
    return { source: this.source, version: this.version, features: normalizeCollection(this.source, collection), metadata: raw.metadata };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const pages: FeatureCollection<Geometry, GeoJsonProperties>["features"] = [];
    let startIndex = 0;
    let nextUrl: string | undefined;
    let crs: string | undefined;
    let pagination = false;
    for (let page = 0; page < this.options.maxPages; page += 1) {
      ensureAbort(signal);
      const params = nextUrl ? undefined : {
        service: "WFS", request: "GetFeature", version: "2.0.0", typeNames: this.options.typeName,
        outputFormat: this.options.outputFormat, bbox: formatBbox(bounds), srsName: this.options.srsName,
        count: String(this.options.pageSize), startIndex: String(startIndex),
      };
      const value = await this.request(params, signal, nextUrl);
      if (!value || typeof value === "string") {
        const gml = typeof value === "string" ? parseGml(value) : emptyCollection();
        return toGeoJsonPayload(this.source, this.version, gml, { status: "ready", contentType: "application/gml+xml", crs: this.options.srsName ?? "unknown", pagination: false });
      }
      const collection = value as Partial<FeatureCollection<Geometry, GeoJsonProperties>> & { numberMatched?: number; numberReturned?: number; next?: string; links?: Array<{ rel?: string; href?: string }> };
      if (Array.isArray(collection.features)) pages.push(...collection.features);
      crs = typeof (collection as { crs?: { properties?: { name?: string } } }).crs?.properties?.name === "string" ? (collection as { crs: { properties: { name: string } } }).crs.properties.name : crs;
      nextUrl = collection.next ?? collection.links?.find((link) => link.rel === "next")?.href;
      const returned = collection.numberReturned ?? collection.features?.length ?? 0;
      pagination = pagination || Boolean(nextUrl) || returned >= this.options.pageSize;
      if (!nextUrl && returned < this.options.pageSize) break;
      startIndex += returned;
    }
    return toGeoJsonPayload(this.source, this.version, { type: "FeatureCollection", features: pages }, {
      crs: crs ?? this.options.srsName ?? "unknown", pagination, pageSize: this.options.pageSize,
    });
  }

  private async request(params: Record<string, string | undefined> | undefined, signal?: AbortSignal, explicitUrl?: string): Promise<unknown> {
    const url = explicitUrl ?? withQuery(this.options.endpoint, params ?? {});
    const response = await (this.options.fetcher ?? fetch)(url, { signal, headers: { Accept: "application/json, application/geo+json, application/xml" } });
    assertOk(response, this.source);
    return readResponse(response);
  }
}

function withQuery(endpoint: string, params: Record<string, string | undefined>): string {
  const url = new URL(endpoint, "http://formiq.local");
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) url.searchParams.set(key, value); });
  return url.origin === "http://formiq.local" ? `${url.pathname}${url.search}` : url.toString();
}

function emptyCollection(): FeatureCollection<Geometry, GeoJsonProperties> { return { type: "FeatureCollection", features: [] }; }

/** Small, dependency-free fallback for simple GML point/line responses. */
function parseGml(xml: string): FeatureCollection<Geometry, GeoJsonProperties> {
  const features: FeatureCollection<Geometry, GeoJsonProperties>["features"] = [];
  const members = [...xml.matchAll(/<(?:\w+:)?featureMember[^>]*>([\s\S]*?)<\/(?:\w+:)?featureMember>/gi)];
  const chunks = members.length ? members.map((match) => match[1] ?? "") : [xml];
  chunks.forEach((chunk, index) => {
    const positions = [...chunk.matchAll(/<(?:\w+:)?(?:pos|coordinates)[^>]*>\s*([^<]+?)\s*<\//gi)]
      .map((match) => String(match[1]).trim().split(/[ ,]+/).map(Number))
      .filter((position) => position.length >= 2 && position.every(Number.isFinite));
    if (positions.length === 1) features.push({ type: "Feature", id: `gml-${index}`, properties: {}, geometry: { type: "Point", coordinates: [positions[0]![0]!, positions[0]![1]!] } });
    if (positions.length > 1) features.push({ type: "Feature", id: `gml-${index}`, properties: {}, geometry: { type: "LineString", coordinates: positions.map((position) => [position[0]!, position[1]!]) } });
  });
  return { type: "FeatureCollection", features };
}
