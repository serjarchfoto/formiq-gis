import { describe, expect, it } from "vitest";
import { createEmptyFormiqProject, normalizeFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type { CanonicalDomain, CanonicalFeature, CanonicalSnapshot, QualityReport, TerritoryReference } from "./types";
import { CanonicalProjectProjection } from "./CanonicalProjectProjection";

const territory: TerritoryReference = {
  id: "territory-1", projectId: "project-1",
  geometry: { type: "Polygon", coordinates: [[[37, 55], [38, 55], [38, 56], [37, 55]]] },
  bbox: [37, 55, 38, 56], crs: "WGS84",
};

describe("CanonicalProjectProjection", () => {
  it("maps canonical domains and preserves styles, settings and territory selection", async () => {
    const project = createProject();
    const originalSettings = structuredClone(project.settings);
    const originalTerritories = structuredClone(project.territories);
    const result = await new CanonicalProjectProjection().projectSnapshot({
      existingProject: project,
      canonicalSnapshot: snapshot([
        feature("building", polygon(), { objectType: "apartments", levels: 5 }),
        feature("road", line(), { roadType: "residential" }),
        feature("green_area", polygon(), { vegetationType: "park" }),
        feature("waterbody", polygon(), { waterType: "pond" }),
        feature("poi", point(), { category: "school", name: "School" }),
        feature("transport_stop", point(), { stopType: "bus_stop", name: "Stop" }),
      ]),
      quality: quality(),
      territory,
    });

    expect(result).toMatchObject({
      activeTerritoryId: "territory-1",
      buildings: [{ type: "building" }], roads: [{ type: "road" }],
      vegetation: [{ type: "vegetation" }], water: [{ type: "water" }],
      poi: [{ type: "poi" }], transitStops: [{ type: "transit-stop" }],
    });
    expect(result.settings).toEqual(originalSettings);
    expect(result.territories).toEqual(originalTerritories);
    expect(result.layerSystem.find((layer) => layer.category === "buildings")).toMatchObject({
      visible: false, opacity: 0.31, style: { fillColor: "#123456", opacity: 0.31 },
    });
    expect(result.analysisResults).toEqual(project.analysisResults);
    expect(result.thematicMaps).toEqual(project.thematicMaps);
  });

  it("fails atomically on an incompatible canonical geometry", async () => {
    const project = createProject();
    const before = structuredClone(project);
    await expect(new CanonicalProjectProjection().projectSnapshot({
      existingProject: project,
      canonicalSnapshot: snapshot([feature("road", polygon(), { roadType: "service" })]),
      quality: quality(), territory,
    })).rejects.toThrow("expected road line");
    expect(project).toEqual(before);
  });

  it("keeps legacy projects without canonical metadata loadable", () => {
    const oldProject = normalizeFormiqProject({ id: "old-project", name: "Old project" });
    expect(oldProject).toMatchObject({ id: "old-project", name: "Old project", buildings: [], roads: [] });
  });
});

function createProject() {
  const project = createEmptyFormiqProject();
  project.id = "project-1";
  project.activeTerritoryId = "territory-1";
  project.territories = [{
    id: "territory-1", name: "Selected", type: "working-area",
    geometry: { type: "Feature", properties: {}, geometry: territory.geometry as Extract<typeof territory.geometry, { type: "Polygon" }> },
    bounds: { west: 37, south: 55, east: 38, north: 56 }, loadingBuffer: { distanceMeters: 0 },
    analysisSettings: { includeBufferInImport: false, calculateOnlyInsideWorkingArea: true },
    thematicMapIds: [], analysisResultIds: [], createdAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z",
    isActive: true, status: "ready", locked: false,
  }];
  project.settings.display.mapZoom = 15;
  project.analysisResults = { legacy: { preserved: true } };
  project.thematicMaps = { legacy: { preserved: true } };
  project.layerSystem = [{
    id: "buildings", name: "Buildings", visible: false, opacity: 0.31, sourceType: "fusion", removable: false, order: 0,
    category: "buildings", geometryType: "polygon", source: { id: "legacy", name: "Legacy", format: "geojson" },
    style: { fillColor: "#123456", opacity: 0.31 },
  }];
  return project;
}

function snapshot(features: CanonicalFeature[]): CanonicalSnapshot {
  return { id: "snapshot-1", projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", createdAt: "2026-07-20T12:00:00.000Z", version: 1, features };
}
function feature(domain: CanonicalDomain, geometry: CanonicalFeature["geometry"], attributes: Record<string, unknown>): CanonicalFeature {
  return { id: `canonical-${domain}`, domain, geometry, attributes: { tags: {}, ...attributes }, projectId: "project-1", territoryId: "territory-1", provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: "2026-07-20T10:00:00.000Z", processedAt: "2026-07-20T10:01:00.000Z", acquisitionMethod: "api", transformationSteps: [] }], geometryConfidence: 0.9, attributeConfidence: 0.8, overallConfidence: 0.85, missingFields: [], validationWarnings: [], preferred: true, version: 1, createdAt: "2026-07-20T10:01:00.000Z", updatedAt: "2026-07-20T10:01:00.000Z" };
}
function quality(): QualityReport { return { id: "quality-1", projectId: "project-1", territoryId: "territory-1", canonicalSnapshotId: "snapshot-1", createdAt: "2026-07-20T12:01:00.000Z", overallStatus: "complete", overallScore: 0.8, domains: {} }; }
function polygon() { return { type: "Polygon" as const, coordinates: [[[37.1, 55.1], [37.2, 55.1], [37.2, 55.2], [37.1, 55.1]]] }; }
function line() { return { type: "LineString" as const, coordinates: [[37.1, 55.1], [37.2, 55.2]] }; }
function point() { return { type: "Point" as const, coordinates: [37.1, 55.1] }; }
