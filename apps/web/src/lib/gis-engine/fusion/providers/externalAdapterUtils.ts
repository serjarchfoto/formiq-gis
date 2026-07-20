import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type { SourceFeature, SourceAdapterRawResult } from "../types";
import { normalizeGeneralGeoJsonFeature } from "./GeoJsonProxySourceAdapter";

export type ExternalFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function formatBbox(bounds: BoundingBox): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
}

export function toGeoJsonPayload(
  source: SourceAdapterRawResult["source"],
  version: string,
  collection: FeatureCollection<Geometry, GeoJsonProperties>,
  metadata: Record<string, string | number | boolean> = {},
  fallbackPrefix = source
): SourceAdapterRawResult {
  return {
    source,
    version,
    payload: { format: "geojson", features: collection.features, normalization: "general", fallbackPrefix },
    metadata: { status: "ready", featureCount: collection.features.length, ...metadata },
  };
}

export function normalizeCollection(
  source: SourceAdapterRawResult["source"],
  collection: FeatureCollection<Geometry, GeoJsonProperties>
): SourceFeature[] {
  return collection.features.flatMap((feature, index) => normalizeGeneralGeoJsonFeature(source, feature, index, source));
}

export function isFeatureCollection(value: unknown): value is FeatureCollection<Geometry, GeoJsonProperties> {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "FeatureCollection" && Array.isArray((value as { features?: unknown }).features));
}

export function isFeature(value: unknown): value is { type: "Feature"; geometry: Geometry | null; properties?: GeoJsonProperties; id?: string | number } {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "Feature");
}

export function ensureAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

export function toFeatureCollection(value: unknown): FeatureCollection<Geometry, GeoJsonProperties> | null {
  if (isFeatureCollection(value)) return value;
  if (isFeature(value) && value.geometry) return { type: "FeatureCollection", features: [value as never] };
  return null;
}

export async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export function assertOk(response: Response, source: string): void {
  if (!response.ok) throw new Error(`${source} proxy failed with status ${response.status}.`);
}
