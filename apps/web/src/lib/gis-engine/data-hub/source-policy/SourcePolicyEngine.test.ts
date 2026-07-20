import { describe, expect, it } from "vitest";
import { SourcePolicyEngine } from "./SourcePolicyEngine";
import { scoreSource } from "./SourceScoring";
import type { SourceCandidate } from "./types";

const engine = new SourcePolicyEngine();

describe("SourcePolicyEngine", () => {
  it("selects OSM when its territory metrics are strong, without making it a global primary", () => {
    const decision = engine.decide({ domain: "building", candidates: [candidate("osm", { expectedCoverage: 0.94, reliabilityScore: 0.9, freshnessScore: 0.8, geometrySuitability: 0.9, attributeSuitability: 0.85 })] });
    expect(decision.selectedSourceIds).toContain("osm");
    expect(decision.reasons.osm).toEqual(expect.arrayContaining([expect.stringContaining("coverage=0.94")]));
  });

  it("rejects low-coverage OSM in favour of authoritative WFS", () => {
    const decision = engine.decide({ domain: "building", candidates: [
      candidate("osm", { expectedCoverage: 0.1, reliabilityScore: 0.7 }),
      candidate("wfs", { expectedCoverage: 0.95, reliabilityScore: 0.95, freshnessScore: 0.9, geometrySuitability: 0.95, attributeSuitability: 0.95 }),
    ] });
    expect(decision.selectedSourceIds[0]).toBe("wfs");
    expect(decision.fallbackSourceIds).toContain("osm");
  });

  it("uses a fallback when the highest-scoring source is unavailable", () => {
    const decision = engine.decide({ domain: "road", candidates: [
      candidate("wfs", { available: false, expectedCoverage: 1 }),
      candidate("osm", { expectedCoverage: 0.8, reliabilityScore: 0.8 }),
    ] });
    expect(decision.selectedSourceIds).toEqual(["osm"]);
    expect(decision.rejectedSourceIds).toContain("wfs");
    expect(decision.reasons.wfs?.[0]).toContain("unavailable");
  });

  it("treats license and automation restrictions as hard constraints", () => {
    const decision = engine.decide({ domain: "waterbody", candidates: [
      candidate("licensed-blocked", { licenseAllowed: false, expectedCoverage: 1, reliabilityScore: 1 }),
      candidate("automation-blocked", { automationAllowed: false, expectedCoverage: 1, reliabilityScore: 1 }),
      candidate("osm", { expectedCoverage: 0.7 }),
    ] });
    expect(decision.selectedSourceIds).toEqual(["osm"]);
    expect(decision.rejectedSourceIds).toEqual(expect.arrayContaining(["licensed-blocked", "automation-blocked"]));
  });

  it("does not give unknown metrics the maximum score", () => {
    const unknown = scoreSource(candidate("unknown"), {
      domain: "poi", preferredSourceIds: [], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62,
    });
    const measured = scoreSource(candidate("measured", { expectedCoverage: 1, reliabilityScore: 1, freshnessScore: 1, geometrySuitability: 1, attributeSuitability: 1 }), {
      domain: "poi", preferredSourceIds: [], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62,
    });
    expect(unknown.score).toBeLessThan(measured.score);
    expect(unknown.reasons).toEqual(expect.arrayContaining([expect.stringContaining("unknown")]));
  });

  it("keeps complementary high-quality sources and exposes a fallback chain", () => {
    const decision = engine.decide({ domain: "green_area", candidates: [
      candidate("municipal-wfs", { expectedCoverage: 0.85, reliabilityScore: 0.9, geometrySuitability: 0.9 }),
      candidate("land-cover", { expectedCoverage: 0.8, reliabilityScore: 0.85, geometrySuitability: 0.8 }),
      candidate("osm", { expectedCoverage: 0, reliabilityScore: 0 }),
    ] });
    expect(decision.selectedSourceIds).toEqual(expect.arrayContaining(["municipal-wfs", "land-cover"]));
    expect(decision.fallbackSourceIds).toContain("osm");
    expect(decision.requiresManualReview).toBe(true);
  });
});

function candidate(sourceId: string, overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId,
    domain: "building",
    available: true,
    coverageKnown: overrides.expectedCoverage !== undefined,
    licenseAllowed: true,
    automationAllowed: true,
    ...overrides,
  };
}
