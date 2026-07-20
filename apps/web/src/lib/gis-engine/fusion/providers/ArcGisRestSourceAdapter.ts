import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult } from "../types";
import { assertOk, ensureAbort, ExternalFetcher, formatBbox, normalizeCollection, readResponse, toGeoJsonPayload } from "./externalAdapterUtils";

export interface ArcGisRestSourceAdapterOptions {
  endpoint?: string;
  layerId?: string | number;
  outFields?: string;
  pageSize?: number;
  maxPages?: number;
  fetcher?: ExternalFetcher;
}

export class ArcGisRestSourceAdapter implements SourceAdapter {
  readonly source = "arcgis-rest" as const;
  readonly version = "arcgis-rest-v1";
  private readonly options: Required<Pick<ArcGisRestSourceAdapterOptions, "endpoint" | "outFields" | "pageSize" | "maxPages">> & ArcGisRestSourceAdapterOptions;

  constructor(options: ArcGisRestSourceAdapterOptions = {}) {
    this.options = { endpoint: "/api/data/arcgis-rest", outFields: "*", pageSize: 1000, maxPages: 20, ...options };
  }

  async describeCapabilities(): Promise<Record<string, unknown>> {
    return { sourceType: "arcgis_rest", kind: "vector", supportedDomains: ["building", "road", "green_area", "waterbody", "boundary", "parcel", "poi", "transport_stop"], supportsBBox: true, supportsPagination: true, crs: "EPSG:4326", authRequired: false, limits: { pageSize: this.options.pageSize, maxPages: this.options.maxPages } };
  }

  async getServiceMetadata(signal?: AbortSignal): Promise<unknown> { return this.request({ f: "json" }, signal, this.serviceUrl()); }

  async listLayers(signal?: AbortSignal): Promise<unknown> {
    const metadata = await this.getServiceMetadata(signal);
    return metadata && typeof metadata === "object" && "layers" in metadata ? (metadata as { layers: unknown }).layers : [];
  }

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    const collection = raw.payload.format === "geojson" ? { type: "FeatureCollection", features: raw.payload.features } as FeatureCollection<Geometry, GeoJsonProperties> : emptyCollection();
    return { source: this.source, version: this.version, features: normalizeCollection(this.source, collection), metadata: raw.metadata };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const features: Feature<Geometry, GeoJsonProperties>[] = [];
    let offset = 0;
    let pagination = false;
    for (let page = 0; page < this.options.maxPages; page += 1) {
      ensureAbort(signal);
      const value = await this.request({
        f: "json", where: "1=1", outFields: this.options.outFields, returnGeometry: "true", outSR: "4326",
        inSR: "4326", geometry: formatBbox(bounds), geometryType: "esriGeometryEnvelope", spatialRel: "esriSpatialRelIntersects",
        resultOffset: String(offset), resultRecordCount: String(this.options.pageSize), resultType: "standard",
      }, signal, this.queryUrl());
      const pageResult = esriToGeoJson(value);
      features.push(...pageResult.features);
      const exceeded = Boolean(value && typeof value === "object" && "exceededTransferLimit" in value && (value as { exceededTransferLimit?: boolean }).exceededTransferLimit);
      pagination = pagination || exceeded || pageResult.features.length >= this.options.pageSize;
      if (!exceeded) break;
      offset += pageResult.features.length;
      if (pageResult.features.length === 0) break;
    }
    return toGeoJsonPayload(this.source, this.version, { type: "FeatureCollection", features }, { pagination, spatialReference: "EPSG:4326", pageSize: this.options.pageSize });
  }

  private serviceUrl(): string { return this.options.layerId === undefined ? this.options.endpoint : `${this.options.endpoint.replace(/\/$/, "")}/${this.options.layerId}`; }
  private queryUrl(): string { return `${this.serviceUrl().replace(/\/$/, "")}/query`; }
  private async request(params: Record<string, string>, signal?: AbortSignal, endpoint = this.options.endpoint): Promise<unknown> {
    const url = new URL(endpoint, "http://formiq.local");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const target = url.origin === "http://formiq.local" ? `${url.pathname}${url.search}` : url.toString();
    const response = await (this.options.fetcher ?? fetch)(target, { signal, headers: { Accept: "application/json" } });
    assertOk(response, this.source);
    return readResponse(response);
  }
}

function esriToGeoJson(value: unknown): FeatureCollection<Geometry, GeoJsonProperties> {
  const rawFeatures = value && typeof value === "object" && Array.isArray((value as { features?: unknown }).features) ? (value as { features: Array<{ attributes?: Record<string, unknown>; geometry?: Record<string, unknown> }> }).features : [];
  const features = rawFeatures.flatMap<Feature<Geometry, GeoJsonProperties>>((item, index) => {
    const geometry = esriGeometry(item.geometry);
    return geometry ? [{ type: "Feature", id: String(item.attributes?.OBJECTID ?? item.attributes?.objectid ?? index), properties: item.attributes ?? {}, geometry }] : [];
  });
  return { type: "FeatureCollection", features };
}

function esriGeometry(value?: Record<string, unknown>): Geometry | null {
  if (!value) return null;
  if (typeof value.x === "number" && typeof value.y === "number") return { type: "Point", coordinates: [value.x, value.y] };
  if (Array.isArray(value.paths)) return { type: "MultiLineString", coordinates: value.paths as number[][][] };
  if (Array.isArray(value.rings)) return { type: "MultiPolygon", coordinates: [value.rings as number[][][]] };
  return null;
}

function emptyCollection(): FeatureCollection<Geometry, GeoJsonProperties> { return { type: "FeatureCollection", features: [] }; }
