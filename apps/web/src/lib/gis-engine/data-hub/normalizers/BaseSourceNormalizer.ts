import type { Geometry, Position } from "geojson";
import type {
  CanonicalDomain,
  NormalizationIssue,
  SourceNormalizer,
} from "../types";

export interface GeometryValidationResult {
  valid: boolean;
  issues: NormalizationIssue[];
  warnings: string[];
}

export abstract class BaseSourceNormalizer implements SourceNormalizer {
  abstract supports(input: { sourceId: string; sourceType: string; domain: CanonicalDomain }): boolean;
  abstract normalize(...args: Parameters<SourceNormalizer["normalize"]>): ReturnType<SourceNormalizer["normalize"]>;

  protected validateGeometry(
    geometry: Geometry | null | undefined,
    domain: CanonicalDomain,
    sourceFeatureId?: string,
    wgs84 = false
  ): GeometryValidationResult {
    return validateGeometryForDomain(geometry, domain, sourceFeatureId, wgs84);
  }
}

export function validateGeometryForDomain(
  geometry: Geometry | null | undefined,
  domain: CanonicalDomain,
  sourceFeatureId?: string,
  wgs84 = false
): GeometryValidationResult {
  const issues: NormalizationIssue[] = [];
  const add = (code: string, message: string) => issues.push({ severity: "error", code, message, sourceFeatureId });
  if (!geometry) {
    add("GEOMETRY_MISSING", "Feature geometry is missing.");
    return { valid: false, issues, warnings: issues.map((issue) => issue.message) };
  }

  const positions = collectGeometryPositions(geometry);
  if (positions.length === 0) add("GEOMETRY_EMPTY", "Feature geometry contains no coordinates.");
  positions.forEach((position) => {
    if (position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
      add("COORDINATE_INVALID", "Feature contains a non-finite or incomplete coordinate.");
    } else if (wgs84 && (position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90)) {
      add("COORDINATE_OUT_OF_RANGE", "WGS84 coordinate is outside longitude/latitude limits.");
    }
  });

  const expected = expectedGeometryTypes(domain);
  if (!expected.includes(geometry.type)) {
    add("GEOMETRY_TYPE_MISMATCH", `Domain "${domain}" does not accept geometry type "${geometry.type}".`);
  }

  for (const ring of polygonRings(geometry)) {
    if (ring.length < 4) add("POLYGON_TOO_FEW_COORDINATES", "Polygon ring requires at least four coordinates.");
    const first = ring[0];
    const last = ring.at(-1);
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      add("POLYGON_RING_NOT_CLOSED", "Polygon ring is not closed; geometry was not repaired.");
    }
  }

  for (const line of lineStrings(geometry)) {
    if (line.length < 2) add("LINE_TOO_FEW_COORDINATES", "LineString requires at least two coordinates.");
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues: deduplicateIssues(issues),
    warnings: deduplicateIssues(issues).map((issue) => issue.message),
  };
}

function expectedGeometryTypes(domain: CanonicalDomain): Geometry["type"][] {
  if (["building", "waterbody", "green_area", "parcel", "boundary", "imagery"].includes(domain)) {
    return domain === "boundary"
      ? ["Polygon", "MultiPolygon", "LineString", "MultiLineString"]
      : ["Polygon", "MultiPolygon"];
  }
  if (domain === "road") return ["LineString", "MultiLineString"];
  if (domain === "poi" || domain === "transport_stop") return ["Point"];
  return ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];
}

function collectGeometryPositions(geometry: Geometry): Position[] {
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(collectGeometryPositions);
  return collectPositions(geometry.coordinates);
}

function collectPositions(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as Position];
  return value.flatMap(collectPositions);
}

function polygonRings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(polygonRings);
  return [];
}

function lineStrings(geometry: Geometry): Position[][] {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(lineStrings);
  return [];
}

function deduplicateIssues(issues: NormalizationIssue[]): NormalizationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.sourceFeatureId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
