import { describe, expect, it } from "vitest";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import { resolveProjectPresentationData } from "./resolvedData";

describe("resolveProjectPresentationData", () => {
  it("keeps project data when it is the only source", () => {
    const project = createAnalysisFixtureProject();
    const resolved = resolveProjectPresentationData(project);
    expect(resolved.buildings.map((item) => item.id)).toEqual(project.buildings.map((item) => item.id));
  });

  it("reads persisted layers when normalized arrays are empty", () => {
    const project = createAnalysisFixtureProject();
    const buildings = project.buildings;
    project.buildings = [];
    project.layers = [{ category: "buildings", buildings, roads: [], vegetation: [], water: [], terrain: [], metadata: { source: "osm", importedAt: "2026-01-01", featureCount: buildings.length } } as never];
    expect(resolveProjectPresentationData(project).buildings).toHaveLength(buildings.length);
  });

  it("reads fusion collections when project and layers have no records", () => {
    const project = createAnalysisFixtureProject();
    const buildings = project.buildings;
    project.buildings = [];
    project.fusion = { collections: { buildings, roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [] } } as never;
    expect(resolveProjectPresentationData(project).buildings).toHaveLength(buildings.length);
  });

  it("merges disjoint project/layer records without duplicate IDs", () => {
    const project = createAnalysisFixtureProject();
    const projectBuilding = project.buildings[0];
    const layerBuilding = { ...project.buildings[1], id: "layer-only-building" };
    project.layers = [{ category: "buildings", buildings: [projectBuilding, layerBuilding], roads: [], vegetation: [], water: [], terrain: [], metadata: { source: "osm", importedAt: "2026-01-01", featureCount: 2 } } as never];
    const resolved = resolveProjectPresentationData(project).buildings;
    expect(resolved.filter((item) => item.id === projectBuilding.id)).toHaveLength(1);
    expect(resolved.some((item) => item.id === "layer-only-building")).toBe(true);
  });

  it("uses project properties when the same stable ID conflicts with a layer", () => {
    const project = createAnalysisFixtureProject();
    const conflicting = { ...project.buildings[0], area: 999_999 };
    project.layers = [{ category: "buildings", buildings: [conflicting], roads: [], vegetation: [], water: [], terrain: [], metadata: { source: "osm", importedAt: "2026-01-01", featureCount: 1 } } as never];
    const resolved = resolveProjectPresentationData(project).buildings.find((item) => item.id === project.buildings[0].id);
    expect(resolved?.area).toBe(project.buildings[0].area);
  });
});
