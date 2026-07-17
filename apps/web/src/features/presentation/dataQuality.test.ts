import { describe, expect, it } from "vitest";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import { auditPresentationMap, getBuildingPopulation, getPresentationDataRequirement, resolvePresentationProject } from "./dataQuality";

describe("presentation data audit", () => {
  it("does not invent population from footprint or levels", () => {
    const project = createAnalysisFixtureProject();
    expect(auditPresentationMap(project, "population-grid").status).toBe("unavailable");
    expect(getBuildingPopulation(project.buildings[0])).toBeNull();
  });

  it("does not use POI as transit stops", () => {
    const project = createAnalysisFixtureProject();
    project.transitStops = [];
    expect(auditPresentationMap(project, "transit-access")).toEqual(expect.objectContaining({ status: "unavailable", knownCount: 0 }));
  });

  it("reports partial coverage instead of replacing unknown floors", () => {
    const project = createAnalysisFixtureProject();
    const audit = auditPresentationMap(project, "building-floors");
    expect(audit.status).toBe("partial");
    expect(audit.knownCount).toBeLessThan(audit.totalCount);
  });

  it("marks shadow analysis unavailable without a solar model", () => {
    expect(auditPresentationMap(createAnalysisFixtureProject(), "shadow-analysis").status).toBe("unavailable");
  });

  it("explains the missing fields and recovery source for unavailable maps", () => {
    const requirement = getPresentationDataRequirement("terrain-height");
    expect(requirement.fields).toContain("elevation");
    expect(requirement.source).toContain("DEM");
    expect(requirement.canAutoLoad).toBe(true);
  });

  it("uses persisted layer/fusion collections when normalized project arrays are empty", () => {
    const project = createAnalysisFixtureProject();
    const buildings = project.buildings;
    project.buildings = [];
    project.layers = [{ category: "buildings", buildings, roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [], metadata: { source: "osm", importedAt: new Date().toISOString(), featureCount: buildings.length } } as never];
    expect(resolvePresentationProject(project).buildings).toHaveLength(buildings.length);
    expect(auditPresentationMap(resolvePresentationProject(project), "building-floors").totalCount).toBe(buildings.length);
  });
});
