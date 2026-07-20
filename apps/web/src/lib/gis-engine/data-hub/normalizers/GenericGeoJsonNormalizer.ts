import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { BaseSourceNormalizer } from "./BaseSourceNormalizer";
import type {
  CanonicalDomain,
  NormalizationContext,
  NormalizationIssue,
  NormalizedSourceDataset,
  NormalizedSourceFeature,
  RawDataRecord,
} from "../types";

export class GenericGeoJsonNormalizer extends BaseSourceNormalizer {
  supports(input: { sourceId: string; sourceType: string; domain: CanonicalDomain }): boolean {
    return input.sourceId !== "osm" && input.sourceType !== "osm" && input.sourceType !== "overpass";
  }

  async normalize(raw: RawDataRecord[], context: NormalizationContext): Promise<NormalizedSourceDataset> {
    const startedAt = new Date().toISOString();
    const features: NormalizedSourceFeature[] = [];
    const issues: NormalizationIssue[] = [];
    for (const record of raw) {
      const inputCrs = readInputCrs(record);
      if (!inputCrs) {
        issues.push({ severity: "warning", code: "CRS_MISSING", message: "Input CRS is not declared; coordinates were not transformed." });
      } else if (!isWgs84(inputCrs)) {
        issues.push({ severity: "error", code: "CRS_TRANSFORM_UNAVAILABLE", message: `No explicit transform rule is configured for "${inputCrs}".` });
        continue;
      }
      for (const candidate of extractCandidates(record.payload)) {
        const normalized = normalizeCandidate(candidate, record, context, inputCrs, this);
        issues.push(...normalized.issues);
        if (normalized.feature) features.push(normalized.feature);
      }
    }
    return {
      sourceId: context.sourceId,
      domain: context.domain,
      rawRecordIds: raw.map((record) => record.id),
      features,
      issues,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  validate(geometry: Geometry, domain: CanonicalDomain, id?: string, wgs84 = false) {
    return this.validateGeometry(geometry, domain, id, wgs84);
  }
}

function normalizeCandidate(
  candidate: Feature<Geometry, GeoJsonProperties> | SourceFeature,
  record: RawDataRecord,
  context: NormalizationContext,
  inputCrs: string | null,
  normalizer: GenericGeoJsonNormalizer
): { feature: NormalizedSourceFeature | null; issues: NormalizationIssue[] } {
  const sourceFeature = "kind" in candidate;
  const domain = sourceFeature ? domainFromKind(candidate.kind) : context.domain;
  if (domain !== context.domain) return { feature: null, issues: [] };
  const sourceFeatureId = sourceFeature
    ? candidate.sourceFeatureId
    : candidate.id !== undefined ? String(candidate.id) : undefined;
  const validation = normalizer.validate(candidate.geometry, domain, sourceFeatureId, Boolean(inputCrs && isWgs84(inputCrs)));
  if (!validation.valid) return { feature: null, issues: validation.issues };
  const attributes = sourceFeature
    ? sourceFeatureAttributes(candidate)
    : { ...(candidate.properties ?? {}) };
  return {
    feature: {
      sourceFeatureId,
      domain,
      geometry: candidate.geometry,
      attributes,
      provenance: {
        sourceId: context.sourceId,
        sourceType: context.sourceType,
        sourceFeatureId,
        acquiredAt: context.acquiredAt,
        processedAt: new Date().toISOString(),
        acquisitionMethod: "api",
        rawRecordId: record.id,
        transformationSteps: [
          inputCrs ? `input-crs:${inputCrs}` : "input-crs:unknown",
          "geojson-attributes-normalized",
        ],
      },
      geometryConfidence: inputCrs ? 0.85 : 0.45,
      attributeConfidence: Object.keys(attributes).length > 0 ? 0.7 : 0.35,
      missingFields: [],
      validationWarnings: validation.warnings,
    },
    issues: validation.issues,
  };
}

function extractCandidates(payload: unknown): Array<Feature<Geometry, GeoJsonProperties> | SourceFeature> {
  if (!payload || typeof payload !== "object") return [];
  if ("format" in payload && (payload as { format?: unknown }).format === "geojson") {
    return ((payload as { features?: unknown }).features as Array<Feature<Geometry, GeoJsonProperties>>) ?? [];
  }
  if ("format" in payload && (payload as { format?: unknown }).format === "source-features") {
    return ((payload as { features?: unknown }).features as SourceFeature[]) ?? [];
  }
  if ((payload as FeatureCollection).type === "FeatureCollection") return (payload as FeatureCollection).features;
  if (Array.isArray((payload as { features?: unknown }).features)) {
    return (payload as { features: Array<Feature<Geometry, GeoJsonProperties> | SourceFeature> }).features;
  }
  return [];
}

function sourceFeatureAttributes(feature: SourceFeature): Record<string, unknown> {
  const { source: _source, sourceFeatureId: _id, geometry: _geometry, kind: _kind, ...attributes } = feature;
  return attributes;
}

function domainFromKind(kind: SourceFeature["kind"]): CanonicalDomain {
  if (kind === "water") return "waterbody";
  if (kind === "vegetation") return "green_area";
  if (kind === "transit-stop") return "transport_stop";
  return kind;
}

function readInputCrs(record: RawDataRecord): string | null {
  const value = record.sourceMetadata.inputCrs ?? record.sourceMetadata.crs;
  return typeof value === "string" && value ? value : null;
}

function isWgs84(value: string): boolean {
  return /^(EPSG:4326|WGS ?84)$/i.test(value.trim());
}
