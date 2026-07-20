import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult, SourceFeature } from "../types";
import { assertOk, ensureAbort, ExternalFetcher, normalizeCollection, readResponse, toFeatureCollection, toGeoJsonPayload } from "./externalAdapterUtils";

export interface GeoJsonSourceAdapterOptions {
  source?: "file" | "geojson";
  endpoint?: string;
  input?: unknown;
  maxBytes?: number;
  domainMapping?: Record<string, SourceFeature["kind"]>;
  fetcher?: ExternalFetcher;
}

export class GeoJsonSourceAdapter implements SourceAdapter {
  readonly source: "file" | "geojson";
  readonly version = "geojson-v1";
  private readonly options: Required<Pick<GeoJsonSourceAdapterOptions, "endpoint" | "maxBytes">> & GeoJsonSourceAdapterOptions;

  constructor(options: GeoJsonSourceAdapterOptions = {}) {
    this.source = options.source ?? "file";
    this.options = { endpoint: "/api/data/geojson", maxBytes: 25 * 1024 * 1024, ...options };
  }

  async describeCapabilities(): Promise<Record<string, unknown>> {
    return { sourceType: "file", kind: "vector", supportedDomains: ["building", "road", "green_area", "waterbody", "boundary", "poi", "transport_stop"], supportsBBox: true, supportsPagination: false, crs: "source-reported", authRequired: false, limits: { maxBytes: this.options.maxBytes } };
  }

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    const collection: FeatureCollection<Geometry, GeoJsonProperties> = raw.payload.format === "geojson"
      ? { type: "FeatureCollection", features: raw.payload.features }
      : { type: "FeatureCollection", features: [] };
    return { source: this.source, version: this.version, features: normalizeCollection(this.source, collection), metadata: raw.metadata };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    ensureAbort(signal);
    const collection = await this.readInput(bounds, signal);
    const mapped = this.applyDomainMapping(collection);
    return toGeoJsonPayload(this.source, this.version, mapped, {
      fileSizeLimitBytes: this.options.maxBytes,
      schema: detectSchema(mapped),
      domainMapping: Boolean(this.options.domainMapping),
    }, this.source);
  }

  private async readInput(bounds: Parameters<SourceAdapter["fetch"]>[0]["bounds"], signal?: AbortSignal): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
    if (this.options.input !== undefined) {
      const input = this.options.input;
      const text = typeof input === "string" ? input : isBlob(input) ? await input.text() : null;
      if (text !== null) {
        if (new TextEncoder().encode(text).byteLength > this.options.maxBytes) throw new Error("GeoJSON file exceeds the configured size limit.");
        return parseCollection(JSON.parse(text));
      }
      return parseCollection(input);
    }
    const url = `${this.options.endpoint}?bbox=${encodeURIComponent([bounds.west, bounds.south, bounds.east, bounds.north].join(","))}`;
    const response = await (this.options.fetcher ?? fetch)(url, { signal, headers: { Accept: "application/geo+json, application/json" } });
    assertOk(response, this.source);
    const value = await readResponse(response);
    return parseCollection(value);
  }

  private applyDomainMapping(collection: FeatureCollection<Geometry, GeoJsonProperties>): FeatureCollection<Geometry, GeoJsonProperties> {
    if (!this.options.domainMapping) return collection;
    return { ...collection, features: collection.features.map((feature) => {
      const properties = { ...(feature.properties ?? {}) };
      for (const [field, kind] of Object.entries(this.options.domainMapping!)) {
        if (properties[field] !== undefined && properties[field] !== null) properties["_formiq:dataset"] = kind;
      }
      return { ...feature, properties };
    }) };
  }
}

function parseCollection(value: unknown): FeatureCollection<Geometry, GeoJsonProperties> {
  const collection = toFeatureCollection(value);
  if (!collection) throw new Error("GeoJSON input must be a Feature or FeatureCollection.");
  const valid = collection.features.filter((feature): feature is Feature<Geometry, GeoJsonProperties> => Boolean(feature.geometry));
  return { type: "FeatureCollection", features: valid };
}

function detectSchema(collection: FeatureCollection<Geometry, GeoJsonProperties>): string {
  const properties = collection.features[0]?.properties;
  return properties ? Object.keys(properties).join(",") : "geometry-only";
}

function isBlob(value: unknown): value is Blob { return typeof Blob !== "undefined" && value instanceof Blob; }
