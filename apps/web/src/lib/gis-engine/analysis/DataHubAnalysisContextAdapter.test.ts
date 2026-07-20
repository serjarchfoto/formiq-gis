import { describe, expect, it, vi } from "vitest";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type {
  CanonicalFeature,
  CanonicalSnapshot,
  DataHubAnalysisContext,
  DataHubQueryServiceApi,
  QualityReport,
  TerritoryReference,
} from "@/lib/gis-engine/data-hub";
import { AnalysisEngine, AnalysisExecutionError } from "./AnalysisEngine";
import { ANALYSIS_REQUIREMENTS, getAnalysisDefinition } from "./AnalysisRequirementsRegistry";
import {
  AnalysisContextResolver,
  DataHubAnalysisContextAdapter,
  LegacyProjectAnalysisContextAdapter,
} from "./DataHubAnalysisContextAdapter";

describe("canonical analysis context", () => {
  it("registers requirements for every current analysis layer", () => {
    expect(Object.keys(ANALYSIS_REQUIREMENTS)).toEqual(expect.arrayContaining([
      "floor-count", "building-age", "building-function", "built-density", "roads",
      "greenery", "water", "poi-transit", "terrain", "population-density",
    ]));
    expect(getAnalysisDefinition("roads").requirements[0]?.domain).toBe("road");
  });

  it("adapts canonical features and does not reuse competing project collections", async () => {
    const project = projectWithTerritory();
    const query = fakeQueryService(contextWith([building("canonical-building")], false));
    const context = await new DataHubAnalysisContextAdapter(query).load({
      analysisId: "built-density", project, territory: territoryReference(),
    });

    expect(context.source).toBe("canonical");
    expect(context.project.buildings.map((item) => item.id)).toEqual(["canonical-building"]);
    expect(context.project.layers).toEqual([]);
    expect(context.project.fusion).toBeNull();
  });

  it("runs supported analyses in degraded mode with an explicit warning", async () => {
    const project = projectWithTerritory();
    const dataHub = contextWith([building("building-1")], true);
    dataHub.warnings = ["Building coverage is estimated."];
    const context = await new DataHubAnalysisContextAdapter(fakeQueryService(dataHub)).load({
      analysisId: "built-density", project, territory: territoryReference(),
    });
    const result = await new AnalysisEngine().runAnalysis({ analysisId: "built-density", context });

    expect(result.state).toBe("degraded");
    expect(result.warnings).toContain("Building coverage is estimated.");
    expect(result.result.buildings.count).toBe(1);
  });

  it("blocks an analysis when all alternative POI domains are empty", async () => {
    const project = projectWithTerritory();
    const context = await new DataHubAnalysisContextAdapter(fakeQueryService(contextWith([], true))).load({
      analysisId: "poi-transit", project, territory: territoryReference(),
    });

    await expect(new AnalysisEngine().runAnalysis({ analysisId: "poi-transit", context }))
      .rejects.toMatchObject<Partial<AnalysisExecutionError>>({ code: "MISSING_REQUIRED_DATA" });
  });

  it("blocks degraded context when the analysis does not support degraded mode", async () => {
    const project = projectWithTerritory();
    const context = await new DataHubAnalysisContextAdapter(fakeQueryService(contextWith([building("building-1")], true))).load({
      analysisId: "sun-shadows", project, territory: territoryReference(),
    });

    await expect(new AnalysisEngine().runAnalysis({ analysisId: "sun-shadows", context }))
      .rejects.toMatchObject<Partial<AnalysisExecutionError>>({ code: "DEGRADED_NOT_SUPPORTED" });
  });

  it("marks old project features with legacy provenance and unknown quality", async () => {
    const project = projectWithTerritory();
    project.buildings = [await projectedLegacyBuilding()];
    const context = await new LegacyProjectAnalysisContextAdapter().load({
      analysisId: "built-density", project, territory: territoryReference(),
    });

    expect(context.source).toBe("legacy");
    expect(context.dataHub.features.building?.[0]?.provenance[0]?.acquisitionMethod).toBe("legacy");
    expect(context.dataHub.quality.overallScore).toBeNull();
    expect(context.dataHub.degraded).toBe(true);
  });

  it("never falls back to legacy when a canonical snapshot exists", async () => {
    const project = projectWithTerritory();
    const canonical = new DataHubAnalysisContextAdapter({
      ...fakeQueryService(contextWith([], true)),
      getLatestSnapshot: vi.fn(async () => snapshot()),
      queryAnalysisContext: vi.fn(async () => { throw new Error("QUALITY_NOT_FOUND"); }),
    });
    const legacy = new LegacyProjectAnalysisContextAdapter();
    const legacySpy = vi.spyOn(legacy, "load");

    await expect(new AnalysisContextResolver(canonical, legacy).load({
      analysisId: "built-density", project, territory: territoryReference(),
    })).rejects.toThrow("QUALITY_NOT_FOUND");
    expect(legacySpy).not.toHaveBeenCalled();
  });
});

function projectWithTerritory() {
  const project = createEmptyFormiqProject();
  project.id = "project-1";
  project.activeTerritoryId = "territory-1";
  project.territories = [{
    id: "territory-1", name: "Test", type: "study-area",
    geometry: { type: "Feature", properties: {}, geometry: territoryReference().geometry as GeoJSON.Polygon },
    bounds: { west: 0, south: 0, east: 1, north: 1 },
    loadingBuffer: { enabled: false, distanceMeters: 0 },
    analysisSettings: { bufferMeters: 0 }, thematicMapIds: [], analysisResultIds: [],
    createdAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z",
    isActive: true, status: "ready", locked: false,
  }];
  return project;
}

function territoryReference(): TerritoryReference {
  return { id: "territory-1", projectId: "project-1", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }, bbox: [0, 0, 1, 1], crs: "WGS84" };
}

function building(id: string): CanonicalFeature {
  return {
    id, domain: "building", geometry: { type: "Polygon", coordinates: [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]]] },
    attributes: { levels: 3, usage: "residential" }, projectId: "project-1", territoryId: "territory-1",
    provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: "2026-07-20T10:00:00.000Z", processedAt: "2026-07-20T10:01:00.000Z", acquisitionMethod: "api", transformationSteps: [] }],
    geometryConfidence: 0.9, attributeConfidence: 0.8, overallConfidence: 0.85, missingFields: [], validationWarnings: [],
    preferred: true, version: 1, createdAt: "2026-07-20T10:01:00.000Z", updatedAt: "2026-07-20T10:01:00.000Z",
  };
}

function contextWith(features: CanonicalFeature[], degraded: boolean): DataHubAnalysisContext {
  const quality = qualityReport(degraded);
  return { projectId: "project-1", territoryId: "territory-1", snapshotId: "snapshot-1", features: { building: features }, quality, ready: features.length > 0, degraded, missingRequirements: features.length ? [] : [{ domain: "building", required: true }], warnings: [] };
}

function qualityReport(degraded: boolean): QualityReport {
  return { id: "quality-1", projectId: "project-1", territoryId: "territory-1", canonicalSnapshotId: "snapshot-1", createdAt: "2026-07-20T10:02:00.000Z", overallStatus: degraded ? "degraded" : "complete", overallScore: degraded ? 0.45 : 0.85, domains: { building: { domain: "building", status: degraded ? "degraded" : "complete", featureCount: 1, coverageScore: degraded ? null : 0.8, geometryScore: 0.9, attributeScore: 0.8, freshnessScore: 0.8, sourceReliabilityScore: 0.8, overallScore: degraded ? 0.45 : 0.85, measurement: degraded ? "estimated" : "measured", measurements: { coverage: degraded ? "unknown" : "measured", geometry: "measured", attributes: "measured", freshness: "measured", sourceReliability: "measured", overall: degraded ? "estimated" : "measured" }, missingRequirements: [], warnings: [], sourceIds: ["osm"] } } };
}

function snapshot(): CanonicalSnapshot {
  return { id: "snapshot-1", projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", createdAt: "2026-07-20T10:01:00.000Z", version: 1, features: [] };
}

function fakeQueryService(context: DataHubAnalysisContext): DataHubQueryServiceApi {
  return {
    queryCanonical: vi.fn(), queryLayers: vi.fn(), getQualityReport: vi.fn(),
    getLatestSnapshot: vi.fn(async () => snapshot()), queryAnalysisContext: vi.fn(async () => context),
  };
}

async function projectedLegacyBuilding() {
  const adapter = new DataHubAnalysisContextAdapter(fakeQueryService(contextWith([building("legacy-source")], false)));
  return (await adapter.load({ analysisId: "built-density", project: projectWithTerritory(), territory: territoryReference() })).project.buildings[0]!;
}
