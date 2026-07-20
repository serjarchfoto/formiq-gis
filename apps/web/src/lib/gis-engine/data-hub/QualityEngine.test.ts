import { describe, expect, it } from "vitest";
import { QualityEngine } from "./QualityEngine";
import type { CanonicalFeature, CanonicalSnapshot, TerritoryReference } from "./types";

const now = new Date("2026-07-20T12:00:00.000Z");
const territory: TerritoryReference = {
  id: "territory-1",
  projectId: "project-1",
  geometry: { type: "Polygon", coordinates: [[[37, 55], [39, 55], [39, 57], [37, 55]]] },
  bbox: [37, 55, 39, 57],
  crs: "EPSG:4326",
};

describe("QualityEngine", () => {
  it("produces complete quality only when every score has evidence", async () => {
    const report = await evaluate([building()], {
      requestedDomains: ["building"],
      coverageByDomain: { building: { score: 0.8, measurement: "measured" } },
      freshnessMaxAgeDaysBySource: { osm: 30 },
      reliabilityBySource: { osm: 0.75 },
    });
    const quality = report.domains.building!;

    expect(quality.status).toBe("complete");
    expect(quality.coverageScore).toBe(0.8);
    expect(quality.measurements).toEqual({
      coverage: "measured", geometry: "measured", attributes: "measured",
      freshness: "measured", sourceReliability: "estimated", overall: "estimated",
    });
    expect(quality.overallScore).toBeGreaterThan(0);
    expectScoresInRange(quality);
  });

  it("returns null and unknown when coverage cannot be established", async () => {
    const quality = (await evaluate([building()], { requestedDomains: ["building"] })).domains.building!;

    expect(quality.status).toBe("partial");
    expect(quality.coverageScore).toBeNull();
    expect(quality.measurements.coverage).toBe("unknown");
    expect(quality.overallScore).toBeNull();
    expect(quality.measurements.overall).toBe("unknown");
  });

  it("marks incomplete domain attributes as degraded without inventing coverage", async () => {
    const incomplete = building({ objectType: null, usage: null, height: null, levels: null, tags: {} });
    const quality = (await evaluate([incomplete], {
      requestedDomains: ["building"],
      coverageByDomain: { building: 0.7 },
      freshnessMaxAgeDaysBySource: { osm: 30 },
      reliabilityBySource: { osm: 0.75 },
    })).domains.building!;

    expect(quality.status).toBe("degraded");
    expect(quality.attributeScore).toBe(0);
  });

  it("reports requested domains without features as empty", async () => {
    const report = await evaluate([], { requestedDomains: ["road"] });
    expect(report.domains.road).toMatchObject({ status: "empty", featureCount: 0, coverageScore: null });
  });

  it("rejects self-intersecting water polygons in the geometry score", async () => {
    const water = canonical("waterbody", {
      type: "Polygon",
      coordinates: [[[37, 55], [39, 57], [39, 55], [37, 57], [37, 55]]],
    }, { waterType: "lake" });
    const quality = (await evaluate([water], { requestedDomains: ["waterbody"] })).domains.waterbody!;
    expect(quality.geometryScore).toBe(0);
    expect(quality.status).toBe("failed");
  });
});

async function evaluate(features: CanonicalFeature[], sourceMetadata: Record<string, unknown>) {
  return new QualityEngine(() => now, () => "quality-id").evaluate({
    snapshot: snapshot(features),
    territory,
    sourceHealth: { osm: { source: "osm", status: "ready", checkedAt: now.toISOString() } },
    sourceMetadata,
  });
}

function snapshot(features: CanonicalFeature[]): CanonicalSnapshot {
  return { id: "snapshot-1", projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", createdAt: now.toISOString(), version: 1, features };
}

function building(attributes: Record<string, unknown> = { objectType: "apartments", height: 15, levels: 5, tags: { building: "apartments" } }): CanonicalFeature {
  return canonical("building", { type: "Polygon", coordinates: [[[37.2, 55.2], [37.3, 55.2], [37.3, 55.3], [37.2, 55.2]]] }, attributes);
}

function canonical(domain: CanonicalFeature["domain"], geometry: CanonicalFeature["geometry"], attributes: Record<string, unknown>): CanonicalFeature {
  return {
    id: `canonical-${domain}`, domain, geometry, attributes, projectId: "project-1", territoryId: "territory-1",
    provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: "2026-07-15T12:00:00.000Z", processedAt: now.toISOString(), acquisitionMethod: "api", transformationSteps: [] }],
    geometryConfidence: 0.9, attributeConfidence: 0.8, overallConfidence: 0.85,
    missingFields: [], validationWarnings: [], preferred: true, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

function expectScoresInRange(quality: NonNullable<Awaited<ReturnType<typeof evaluate>>["domains"]["building"]>) {
  for (const score of [quality.coverageScore, quality.geometryScore, quality.attributeScore, quality.freshnessScore, quality.sourceReliabilityScore, quality.overallScore]) {
    if (score !== null) expect(score).toBeGreaterThanOrEqual(0);
    if (score !== null) expect(score).toBeLessThanOrEqual(1);
  }
}
