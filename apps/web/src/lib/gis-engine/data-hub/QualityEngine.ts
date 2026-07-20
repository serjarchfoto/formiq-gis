import type { Geometry, Position } from "geojson";
import type {
  CanonicalDomain,
  CanonicalFeature,
  DomainQuality,
  QualityEngineApi,
  QualityMeasurement,
  QualityReport,
} from "./types";

interface ScoreResult {
  score: number | null;
  measurement: QualityMeasurement;
}

export class QualityEngine implements QualityEngineApi {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  async evaluate(input: Parameters<QualityEngineApi["evaluate"]>[0]): Promise<QualityReport> {
    const requested = readRequestedDomains(input.sourceMetadata);
    const domains = [...new Set<CanonicalDomain>([
      ...requested,
      ...input.snapshot.features.map((feature) => feature.domain),
    ])];
    const qualityEntries = domains.map((domain) => {
      const candidates = input.snapshot.features.filter((feature) => feature.domain === domain);
      return [domain, evaluateDomain({
        domain,
        features: candidates.filter((feature) => feature.preferred),
        allCandidates: candidates,
        territoryGeometry: input.territory.geometry,
        sourceHealth: input.sourceHealth,
        sourceMetadata: input.sourceMetadata,
        now: this.now(),
      })] as const;
    });
    const domainReports = Object.fromEntries(qualityEntries) as Partial<Record<CanonicalDomain, DomainQuality>>;
    const reports = qualityEntries.map(([, report]) => report);
    const knownOverallScores = reports.map((report) => report.overallScore);
    const overallScore = reports.length > 0 && knownOverallScores.every((score): score is number => score !== null)
      ? rounded(knownOverallScores.reduce((sum, score) => sum + score, 0) / knownOverallScores.length)
      : null;

    return {
      id: `quality:${input.snapshot.id}:${this.createId()}`,
      projectId: input.snapshot.projectId,
      territoryId: input.snapshot.territoryId,
      canonicalSnapshotId: input.snapshot.id,
      createdAt: this.now().toISOString(),
      overallStatus: aggregateStatus(reports),
      overallScore,
      domains: domainReports,
    };
  }
}

function evaluateDomain(input: {
  domain: CanonicalDomain;
  features: CanonicalFeature[];
  allCandidates: CanonicalFeature[];
  territoryGeometry: Geometry;
  sourceHealth: Record<string, unknown>;
  sourceMetadata: Record<string, unknown>;
  now: Date;
}): DomainQuality {
  const warnings: string[] = [];
  const geometry = geometryScore(input.features, input.domain);
  const attributes = attributeScore(input.features, input.domain);
  const coverage = coverageScore(input.features, input.domain, input.territoryGeometry, input.sourceMetadata);
  const freshness = freshnessScore(input.features, input.sourceMetadata, input.now);
  const reliability = reliabilityScore(input.features, input.sourceMetadata);
  const sources = [...new Set(input.features.flatMap((feature) => feature.provenance.map((item) => item.sourceId)))];
  const unavailableSources = sources.filter((sourceId) => sourceHealthStatus(input.sourceHealth[sourceId]) === "unavailable");
  const unknownHealthSources = sources.filter((sourceId) => sourceHealthStatus(input.sourceHealth[sourceId]) === "unknown");

  if (input.allCandidates.length > input.features.length) {
    warnings.push(`${input.allCandidates.length - input.features.length} conflicting candidate(s) are retained but excluded from preferred-feature metrics.`);
  }
  if (input.domain === "road") warnings.push("Road connectivity is not scored without an explicit network-topology methodology.");
  if (input.domain === "green_area" && !input.sourceMetadata.spatialResolutionBySource) {
    warnings.push("Green-area source resolution is unknown.");
  }
  if (coverage.score === null) warnings.push("Coverage completeness cannot be measured from the available evidence.");
  if (freshness.score === null) warnings.push("Freshness is unknown because no source freshness policy is declared.");
  if (reliability.score === null) warnings.push("Source reliability is unknown because no reliability evidence is declared.");
  if (unavailableSources.length) warnings.push(`Current source health is not ready: ${unavailableSources.join(", ")}.`);
  if (unknownHealthSources.length) warnings.push(`Current source health is unknown: ${unknownHealthSources.join(", ")}.`);

  const components = [coverage, geometry, attributes, freshness, reliability];
  const allKnown = components.every((component) => component.score !== null);
  const overallScore = allKnown
    ? rounded(components.reduce((sum, component) => sum + component.score!, 0) / components.length)
    : null;
  const overallMeasurement = allKnown
    ? combineMeasurements(components.map((component) => component.measurement))
    : "unknown";
  const status = input.allCandidates.length > input.features.length
    ? degradeForConflicts(domainStatus(input.features.length, geometry.score, attributes.score, components))
    : domainStatus(input.features.length, geometry.score, attributes.score, components);

  return {
    domain: input.domain,
    status,
    featureCount: input.features.length,
    coverageScore: coverage.score,
    geometryScore: geometry.score,
    attributeScore: attributes.score,
    freshnessScore: freshness.score,
    sourceReliabilityScore: reliability.score,
    overallScore,
    measurement: overallMeasurement,
    measurements: {
      coverage: coverage.measurement,
      geometry: geometry.measurement,
      attributes: attributes.measurement,
      freshness: freshness.measurement,
      sourceReliability: reliability.measurement,
      overall: overallMeasurement,
    },
    missingRequirements: [],
    warnings,
    sourceIds: sources,
  };
}

function geometryScore(features: CanonicalFeature[], domain: CanonicalDomain): ScoreResult {
  if (features.length === 0) return unknown();
  const valid = features.filter((feature) => validGeometry(feature.geometry, domain)).length;
  return measured(valid / features.length);
}

function attributeScore(features: CanonicalFeature[], domain: CanonicalDomain): ScoreResult {
  if (features.length === 0) return unknown();
  const featureScores = features.map((feature) => {
    const value = feature.attributes;
    if (domain === "building") return ratio([
      present(value.objectType) || present(value.usage) || tagPresent(value.tags, "building"),
      numeric(value.height) || numeric(value.levels),
    ]);
    if (domain === "road") return ratio([present(value.roadType)]);
    if (domain === "green_area") return ratio([present(value.vegetationType)]);
    if (domain === "waterbody") return ratio([present(value.waterType)]);
    if (domain === "poi") return ratio([present(value.category), present(value.name)]);
    if (domain === "transport_stop") return ratio([present(value.stopType), present(value.name)]);
    if (domain === "boundary") return ratio([present(value.adminLevel) || present(value.name)]);
    if (domain === "terrain") return ratio([numeric(value.elevation)]);
    return null;
  });
  const knownScores = featureScores.filter((score): score is number => score !== null);
  if (knownScores.length !== featureScores.length) return unknown();
  return measured(knownScores.reduce((sum, score) => sum + score, 0) / knownScores.length);
}

function coverageScore(
  features: CanonicalFeature[],
  domain: CanonicalDomain,
  territory: Geometry,
  sourceMetadata: Record<string, unknown>
): ScoreResult {
  const declared = readDeclaredCoverage(sourceMetadata, domain);
  if (declared) return declared;
  if (features.length === 0) return unknown();
  if (domain !== "green_area" && domain !== "waterbody") return unknown();
  const territoryArea = polygonArea(territory);
  if (territoryArea <= 0) return unknown();
  const featureArea = features.reduce((sum, feature) => sum + polygonArea(feature.geometry), 0);
  if (featureArea <= 0) return unknown();
  // Geographic coordinates are evaluated as a planar ratio; this is an estimate,
  // not a completeness claim or a scientific geodesic measurement.
  return { score: rounded(Math.min(featureArea / territoryArea, 1)), measurement: "estimated" };
}

function freshnessScore(features: CanonicalFeature[], sourceMetadata: Record<string, unknown>, now: Date): ScoreResult {
  if (features.length === 0) return unknown();
  const policies = recordValue(sourceMetadata.freshnessMaxAgeDaysBySource);
  const observations: number[] = [];
  const provenanceRecords = features.flatMap((feature) => feature.provenance);
  for (const provenance of provenanceRecords) {
    const maxAgeDays = numberValue(policies?.[provenance.sourceId]);
    const acquiredAt = Date.parse(provenance.acquiredAt);
    if (!maxAgeDays || !Number.isFinite(acquiredAt)) continue;
    const ageDays = Math.max(0, now.getTime() - acquiredAt) / 86_400_000;
    observations.push(ageDays <= maxAgeDays ? 1 : 0);
  }
  return observations.length === provenanceRecords.length && observations.length > 0
    ? measured(observations.reduce((sum, value) => sum + value, 0) / observations.length)
    : unknown();
}

function reliabilityScore(features: CanonicalFeature[], sourceMetadata: Record<string, unknown>): ScoreResult {
  const declared = recordValue(sourceMetadata.reliabilityBySource);
  const sources = [...new Set(features.flatMap((feature) => feature.provenance.map((item) => item.sourceId)))];
  const values = sources.map((sourceId) => numberValue(declared?.[sourceId])).filter((value): value is number => value !== null && value >= 0 && value <= 1);
  return values.length === sources.length && values.length > 0
    ? { score: rounded(values.reduce((sum, value) => sum + value, 0) / values.length), measurement: "estimated" }
    : unknown();
}

function validGeometry(geometry: Geometry, domain: CanonicalDomain): boolean {
  const positions = collectPositions(geometry);
  if (positions.length === 0 || positions.some((position) => position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]))) return false;
  if ((domain === "poi" || domain === "transport_stop") && geometry.type !== "Point") return false;
  if (domain === "road" && geometry.type !== "LineString" && geometry.type !== "MultiLineString") return false;
  if (["building", "green_area", "parcel"].includes(domain) && geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return false;
  if ((domain === "waterbody" || domain === "boundary") && !["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(geometry.type)) return false;
  for (const line of lines(geometry)) if (line.length < 2) return false;
  for (const ring of rings(geometry)) {
    if (ring.length < 4 || !samePosition(ring[0], ring.at(-1))) return false;
    if (hasSelfIntersection(ring)) return false;
  }
  return true;
}

function readDeclaredCoverage(metadata: Record<string, unknown>, domain: CanonicalDomain): ScoreResult | null {
  const coverage = recordValue(recordValue(metadata.coverageByDomain)?.[domain]);
  const direct = numberValue(recordValue(metadata.coverageByDomain)?.[domain]);
  const score = direct ?? numberValue(coverage?.score);
  if (score === null || score < 0 || score > 1) return null;
  const measurement = coverage?.measurement;
  return { score, measurement: measurement === "measured" || measurement === "estimated" ? measurement : "estimated" };
}

function readRequestedDomains(metadata: Record<string, unknown>): CanonicalDomain[] {
  const values = metadata.requestedDomains;
  return Array.isArray(values) ? values.filter(isCanonicalDomain) : [];
}

function isCanonicalDomain(value: unknown): value is CanonicalDomain {
  return typeof value === "string" && ["building", "road", "waterbody", "green_area", "parcel", "poi", "transport_stop", "boundary", "terrain", "imagery"].includes(value);
}

function sourceHealthStatus(value: unknown): "ready" | "unavailable" | "unknown" {
  const record = recordValue(value);
  if (!record || typeof record.status !== "string") return "unknown";
  return record.status === "ready" ? "ready" : "unavailable";
}

function domainStatus(featureCount: number, geometry: number | null, attributes: number | null, components: ScoreResult[]): DomainQuality["status"] {
  if (featureCount === 0) return "empty";
  if (geometry === 0) return "failed";
  if (geometry !== null && geometry < 1 || attributes !== null && attributes < 1) return "degraded";
  if (components.some((component) => component.score === null)) return "partial";
  return "complete";
}

function degradeForConflicts(status: DomainQuality["status"]): DomainQuality["status"] {
  return status === "complete" || status === "partial" ? "degraded" : status;
}

function aggregateStatus(reports: DomainQuality[]): QualityReport["overallStatus"] {
  if (reports.length === 0) return "empty";
  if (reports.every((report) => report.status === "empty")) return "empty";
  if (reports.some((report) => report.status === "failed")) return "failed";
  if (reports.some((report) => report.status === "degraded")) return "degraded";
  if (reports.some((report) => report.status === "empty" || report.status === "partial")) return "partial";
  return "complete";
}

function combineMeasurements(values: QualityMeasurement[]): QualityMeasurement {
  if (values.some((value) => value === "unknown")) return "unknown";
  return values.some((value) => value === "estimated") ? "estimated" : "measured";
}

function measured(score: number): ScoreResult { return { score: rounded(score), measurement: "measured" }; }
function unknown(): ScoreResult { return { score: null, measurement: "unknown" }; }
function rounded(value: number): number { return Number(Math.max(0, Math.min(1, value)).toFixed(3)); }
function ratio(values: boolean[]): number { return values.filter(Boolean).length / values.length; }
function present(value: unknown): boolean { return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined; }
function numeric(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value); }
function tagPresent(value: unknown, key: string): boolean { return Boolean(recordValue(value)?.[key]); }
function recordValue(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function collectPositions(geometry: Geometry): Position[] {
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(collectPositions);
  return nestedPositions(geometry.coordinates);
}
function nestedPositions(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as Position];
  return value.flatMap(nestedPositions);
}
function rings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(rings);
  return [];
}
function lines(geometry: Geometry): Position[][] {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(lines);
  return [];
}
function samePosition(left: Position | undefined, right: Position | undefined): boolean {
  return Boolean(left && right && left[0] === right[0] && left[1] === right[1]);
}
function polygonArea(geometry: Geometry): number {
  return rings(geometry).reduce((sum, ring) => sum + Math.abs(ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[(index + 1) % (ring.length - 1)]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2, 0);
}
function hasSelfIntersection(ring: Position[]): boolean {
  for (let left = 0; left < ring.length - 1; left += 1) {
    for (let right = left + 1; right < ring.length - 1; right += 1) {
      if (Math.abs(left - right) <= 1 || left === 0 && right === ring.length - 2) continue;
      if (segmentsIntersect(ring[left]!, ring[left + 1]!, ring[right]!, ring[right + 1]!)) return true;
    }
  }
  return false;
}
function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const cross = (p: Position, q: Position, r: Position) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
