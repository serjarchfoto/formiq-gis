import type { Geometry, Position } from "geojson";
import type { SourceAdapterRawResult, SourceFeature } from "@/lib/gis-engine/fusion/types";
import type { OverpassElement, OverpassResponse } from "@/services/overpass";
import { BaseSourceNormalizer, validateGeometryForDomain } from "./BaseSourceNormalizer";
import type {
  CanonicalDomain,
  NormalizationContext,
  NormalizationIssue,
  NormalizedSourceDataset,
  NormalizedSourceFeature,
  RawDataRecord,
} from "../types";

const OSM_DOMAINS: CanonicalDomain[] = [
  "building", "road", "waterbody", "green_area", "poi", "transport_stop", "boundary", "parcel",
];

export class OSMSourceNormalizer extends BaseSourceNormalizer {
  supports(input: { sourceId: string; sourceType: string; domain: CanonicalDomain }): boolean {
    return (input.sourceId === "osm" || input.sourceType === "osm" || input.sourceType === "overpass") &&
      OSM_DOMAINS.includes(input.domain);
  }

  async normalize(raw: RawDataRecord[], context: NormalizationContext): Promise<NormalizedSourceDataset> {
    const startedAt = new Date().toISOString();
    const issues: NormalizationIssue[] = [];
    const features: NormalizedSourceFeature[] = [];
    const seen = new Set<string>();

    for (const record of raw) {
      const responses = extractOverpassResponses(record.payload);
      if (!responses) {
        issues.push({ severity: "error", code: "OSM_RAW_INVALID", message: "Raw record is not an Overpass payload." });
        continue;
      }
      for (const response of responses) {
        for (const element of response.elements) {
          const normalized = normalizeElement(element, context, record.id);
          issues.push(...normalized.issues);
          if (!normalized.feature || normalized.feature.domain !== context.domain) continue;
          const key = `${normalized.feature.domain}:${normalized.feature.sourceFeatureId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          features.push(normalized.feature);
        }
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
}

export async function normalizeOsmRawResultToLegacySourceFeatures(
  raw: SourceAdapterRawResult
): Promise<SourceFeature[]> {
  const rawRecord: RawDataRecord = {
    id: `legacy-raw-${Date.now()}`,
    ingestionRunId: "legacy-adapter",
    projectId: "legacy-project",
    territoryId: "legacy-territory",
    sourceId: "osm",
    domain: "building",
    receivedAt: new Date().toISOString(),
    sourceMetadata: { inputCrs: "EPSG:4326", compatibility: true },
    payload: raw.payload,
  };
  const normalizer = new OSMSourceNormalizer();
  const features: SourceFeature[] = [];
  for (const domain of OSM_DOMAINS) {
    const dataset = await normalizer.normalize([rawRecord], legacyContext(domain, rawRecord));
    features.push(...dataset.features.map(normalizedOsmFeatureToLegacy));
  }
  return deduplicateLegacy(features);
}

export function normalizeOsmElementToLegacySourceFeatures(element: OverpassElement): SourceFeature[] {
  const rawId = `legacy-element-${element.type}-${element.id}`;
  const context = legacyContext("building", {
    id: rawId,
    receivedAt: new Date().toISOString(),
  });
  const normalized = normalizeElement(element, context, rawId);
  return normalized.feature ? [normalizedOsmFeatureToLegacy(normalized.feature)] : [];
}

function normalizeElement(
  element: OverpassElement,
  context: NormalizationContext,
  rawRecordId: string
): { feature: NormalizedSourceFeature | null; issues: NormalizationIssue[] } {
  const sourceFeatureId = `osm-${element.type}-${element.id}`;
  const tags = element.tags;
  if (!tags || Object.keys(tags).length === 0) {
    return {
      feature: null,
      issues: [{ severity: "info", code: "OSM_TAGS_MISSING", message: "OSM element has no classification tags.", sourceFeatureId }],
    };
  }
  const domain = classifyOsmDomain(tags, element);
  if (!domain) return { feature: null, issues: [] };
  const geometry = createOsmGeometry(element, domain);
  const validation = validateGeometryForDomain(geometry, domain, sourceFeatureId, true);
  if (!validation.valid || !geometry) return { feature: null, issues: validation.issues };

  const attributes = mapOsmAttributes(domain, tags);
  const missingFields = missingOsmFields(domain, attributes);
  return {
    feature: {
      sourceFeatureId,
      domain,
      geometry,
      attributes,
      provenance: {
        sourceId: context.sourceId,
        sourceType: "osm",
        sourceFeatureId,
        acquiredAt: context.acquiredAt,
        processedAt: new Date().toISOString(),
        acquisitionMethod: "api",
        rawRecordId,
        license: "ODbL",
        attribution: "© OpenStreetMap contributors",
        transformationSteps: ["input-crs:EPSG:4326", "overpass-geometry-to-geojson", "osm-tags-to-domain"],
      },
      geometryConfidence: 0.9,
      attributeConfidence: calculateAttributeConfidence(attributes, missingFields),
      missingFields,
      validationWarnings: validation.warnings,
    },
    issues: validation.issues,
  };
}

export function classifyOsmDomain(
  tags: Record<string, string>,
  element?: Pick<OverpassElement, "center" | "geometry">
): CanonicalDomain | null {
  const isPoint = Boolean(element?.center || element?.geometry?.length === 1);
  if (isPoint && (tags.public_transport || tags.highway === "bus_stop" || tags.railway)) return "transport_stop";
  if (isPoint && (tags.amenity || tags.shop || tags.tourism || tags.office)) return "poi";
  if (tags.building) return "building";
  if (tags.highway) return "road";
  if (tags.natural === "water" || tags.water || tags.waterway) return "waterbody";
  if (tags.boundary || tags.admin_level) return "boundary";
  if (tags.landuse === "parcel" || tags.cadastre) return "parcel";
  if (tags.landuse || tags.leisure === "park" || tags.leisure === "garden" || tags.natural) return "green_area";
  return null;
}

function createOsmGeometry(element: OverpassElement, domain: CanonicalDomain): Geometry | null {
  const coordinates = (element.geometry ?? []).map<Position>((point) => [point.lon, point.lat]);
  if (domain === "poi" || domain === "transport_stop") {
    if (element.center) return { type: "Point", coordinates: [element.center.lon, element.center.lat] };
    return coordinates[0] ? { type: "Point", coordinates: coordinates[0] } : null;
  }
  if (domain === "road") return { type: "LineString", coordinates };
  return { type: "Polygon", coordinates: [coordinates] };
}

function mapOsmAttributes(domain: CanonicalDomain, tags: Record<string, string>): Record<string, unknown> {
  const common = { tags: { ...tags }, name: tags.name ?? null };
  if (domain === "building") return {
    ...common,
    height: parseNumber(tags.height),
    levels: parseNumber(tags["building:levels"]),
    year: parseYear(tags.start_date ?? tags["building:year"] ?? tags.year),
    usage: tags.building ?? tags.amenity ?? tags.shop ?? tags.office ?? null,
    material: tags["building:material"] ?? tags.material ?? null,
    roof: tags["roof:shape"] ?? tags.roof ?? null,
    addressLabel: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || null,
    objectType: tags.building ?? null,
  };
  if (domain === "road") return {
    ...common, roadType: tags.highway ?? null, surface: tags.surface ?? null, lanes: parseNumber(tags.lanes),
  };
  if (domain === "waterbody") return { ...common, waterType: tags.water ?? tags.waterway ?? tags.natural ?? null };
  if (domain === "green_area") return { ...common, vegetationType: tags.landuse ?? tags.leisure ?? tags.natural ?? null };
  if (domain === "poi") return {
    ...common, category: tags.amenity ?? tags.shop ?? tags.tourism ?? tags.office ?? "poi", subtype: tags["amenity:type"] ?? null,
  };
  if (domain === "transport_stop") return {
    ...common, network: tags.operator ?? tags.network ?? null, stopType: tags.public_transport ?? tags.highway ?? tags.railway ?? null,
  };
  if (domain === "boundary") return { ...common, adminLevel: tags.admin_level ?? null };
  return common;
}

function missingOsmFields(domain: CanonicalDomain, attributes: Record<string, unknown>): string[] {
  const fields: Partial<Record<CanonicalDomain, string[]>> = {
    building: ["height", "levels", "usage"],
    road: ["roadType", "surface"],
    waterbody: ["waterType"],
    green_area: ["vegetationType"],
    poi: ["category", "name"],
    transport_stop: ["stopType", "name"],
    boundary: ["adminLevel"],
  };
  return (fields[domain] ?? []).filter((field) => attributes[field] === null || attributes[field] === undefined || attributes[field] === "");
}

function calculateAttributeConfidence(attributes: Record<string, unknown>, missing: string[]): number {
  const meaningful = Object.keys(attributes).filter((key) => key !== "tags").length;
  return Number(Math.max(0.35, Math.min(0.95, meaningful === 0 ? 0.35 : 0.9 - missing.length * 0.1)).toFixed(2));
}

function normalizedOsmFeatureToLegacy(feature: NormalizedSourceFeature): SourceFeature {
  const attributes = feature.attributes;
  const tags = toStringRecord(attributes.tags);
  const base = {
    source: "osm" as const,
    sourceFeatureId: feature.sourceFeatureId ?? `osm-${feature.domain}-${Date.now()}`,
    geometry: feature.geometry,
    tags,
    names: typeof attributes.name === "string" ? { default: attributes.name } : undefined,
  };
  if (feature.domain === "building") return {
    ...base, kind: "building", height: numberOrNull(attributes.height), levels: numberOrNull(attributes.levels),
    year: numberOrNull(attributes.year), usage: stringOrNull(attributes.usage), material: stringOrNull(attributes.material),
    roof: stringOrNull(attributes.roof), addressLabel: stringOrNull(attributes.addressLabel), objectType: stringOrNull(attributes.objectType),
  };
  if (feature.domain === "road") return {
    ...base, kind: "road", roadType: stringOrNull(attributes.roadType), surface: stringOrNull(attributes.surface),
    name: stringOrNull(attributes.name), lanes: numberOrNull(attributes.lanes),
  };
  if (feature.domain === "waterbody") return { ...base, kind: "water", waterType: stringOrNull(attributes.waterType) };
  if (feature.domain === "green_area") return { ...base, kind: "vegetation", vegetationType: stringOrNull(attributes.vegetationType) };
  if (feature.domain === "poi") return {
    ...base, kind: "poi", category: stringOrNull(attributes.category), subtype: stringOrNull(attributes.subtype), name: stringOrNull(attributes.name),
  };
  if (feature.domain === "transport_stop") return {
    ...base, kind: "transit-stop", network: stringOrNull(attributes.network), stopType: stringOrNull(attributes.stopType), name: stringOrNull(attributes.name),
  };
  return { ...base, kind: "boundary", adminLevel: stringOrNull(attributes.adminLevel), name: stringOrNull(attributes.name) };
}

function extractOverpassResponses(payload: unknown): OverpassResponse[] | null {
  if (!payload || typeof payload !== "object") return null;
  if ("format" in payload && (payload as { format?: unknown }).format === "overpass") {
    const responses = (payload as { responses?: unknown }).responses;
    return Array.isArray(responses) ? responses as OverpassResponse[] : null;
  }
  if ("elements" in payload && Array.isArray((payload as { elements?: unknown }).elements)) {
    return [payload as OverpassResponse];
  }
  return null;
}

function legacyContext(domain: CanonicalDomain, raw: Pick<RawDataRecord, "id" | "receivedAt">): NormalizationContext {
  return {
    projectId: "legacy-project", territoryId: "legacy-territory", ingestionRunId: "legacy-adapter",
    sourceId: "osm", sourceType: "osm", domain, rawRecordId: raw.id, acquiredAt: raw.receivedAt,
  };
}

function deduplicateLegacy(features: SourceFeature[]): SourceFeature[] {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const key = `${feature.kind}:${feature.sourceFeatureId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYear(value: string | undefined): number | null {
  const match = value?.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
