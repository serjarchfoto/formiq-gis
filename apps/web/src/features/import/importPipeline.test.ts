import { describe, expect, it, vi } from "vitest";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type { DataHubApi, RefreshTerritoryResult } from "@/lib/gis-engine/data-hub";
import { getBoundingBoxAreaSquareKilometers, getImportStageCount, ImportPipeline } from "./importPipeline";

const bounds = { west: 37.5, south: 55.7, east: 37.55, north: 55.75 };

describe("ImportPipeline Data Hub facade", () => {
  it("counts the existing user-facing stages", () => {
    expect(getImportStageCount(["osm", "microsoft-buildings", "wikidata", "copernicus-dem"])).toBe(10);
    expect(getImportStageCount(["osm"])).toBe(9);
    expect(getImportStageCount([])).toBe(9);
  });

  it("rejects a very large territory before constructing the import flow", async () => {
    const large = { west: 38.65, south: 55.02, east: 38.9, north: 55.22 };
    expect(getBoundingBoxAreaSquareKilometers(large)).toBeGreaterThan(50);
    await expect(new ImportPipeline({ dataHub: fakeDataHub(successResult()) }).run(large, { sources: ["osm"] })).rejects.toThrow("Территория слишком большая");
  });

  it("runs refresh, maps progress, projects and updates the project only after projection", async () => {
    const refresh = successResult();
    const dataHub = fakeDataHub(refresh, true);
    const project = existingProject();
    const updates: string[] = [];
    const progress: string[] = [];
    const result = await new ImportPipeline({ dataHub }).run(bounds, {
      sources: ["osm"], existingProject: project,
      onProgress: (event) => progress.push(`${event.source}:${event.status}`),
      onProjectUpdate: async (projected) => { updates.push(projected.id); },
    });

    expect(dataHub.refreshTerritory).toHaveBeenCalledOnce();
    expect(updates).toEqual([project.id]);
    expect(result).toMatchObject({ snapshotId: "snapshot-1", qualityStatus: "partial", project: { id: project.id } });
    expect(result.project.buildings).toHaveLength(1);
    expect(progress).toEqual(expect.arrayContaining([
      "health-check:loading", "health-check:ready", "import-buildings:loading", "ready:ready",
    ]));
  });

  it("preserves the prior project when Data Hub reports failed", async () => {
    const project = existingProject();
    const before = structuredClone(project);
    const update = vi.fn();
    const projector = { projectSnapshot: vi.fn() };
    await expect(new ImportPipeline({ dataHub: fakeDataHub(successResult("failed")), projector }).run(bounds, {
      sources: ["osm"], existingProject: project, onProjectUpdate: update,
    })).rejects.toThrow("existing project was preserved");
    expect(projector.projectSnapshot).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it("keeps the completed canonical refresh when projection fails and does not update project state", async () => {
    const project = existingProject();
    const before = structuredClone(project);
    let canonicalSaved = false;
    const dataHub = fakeDataHub(successResult());
    vi.mocked(dataHub.refreshTerritory).mockImplementation(async () => { canonicalSaved = true; return successResult(); });
    const update = vi.fn();
    const projector = { projectSnapshot: vi.fn(async () => { throw new Error("projection failed"); }) };

    await expect(new ImportPipeline({ dataHub, projector }).run(bounds, {
      sources: ["osm"], existingProject: project, onProjectUpdate: update,
    })).rejects.toThrow("projection failed");
    expect(canonicalSaved).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });
});

function fakeDataHub(result: RefreshTerritoryResult, emitProgress = false): DataHubApi {
  return {
    refreshTerritory: vi.fn(async (_request, options) => {
      if (emitProgress) {
        options?.onProgress?.({ runId: "run-1", stage: "health_check", completed: 0, total: 1 });
        options?.onProgress?.({ runId: "run-1", stage: "health_check", completed: 1, total: 1 });
        options?.onProgress?.({ runId: "run-1", stage: "fetching", domain: "building", sourceId: "osm", completed: 0, total: 1 });
        options?.onProgress?.({ runId: "run-1", stage: "normalizing", domain: "building", sourceId: "osm", completed: 1, total: 1 });
      }
      return result;
    }),
    queryCanonical: vi.fn(), queryLayers: vi.fn(), queryAnalysisContext: vi.fn(), getLatestSnapshot: vi.fn(), getQualityReport: vi.fn(),
  } as DataHubApi;
}

function successResult(status: RefreshTerritoryResult["ingestionRun"]["status"] = "completed"): RefreshTerritoryResult {
  const feature = {
    id: "canonical-building", domain: "building" as const,
    geometry: { type: "Polygon" as const, coordinates: [[[37.51, 55.71], [37.52, 55.71], [37.52, 55.72], [37.51, 55.71]]] },
    attributes: { objectType: "apartments", levels: 5, tags: { building: "apartments" } },
    projectId: "project-1", territoryId: "territory-1",
    provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: "2026-07-20T10:00:00.000Z", processedAt: "2026-07-20T10:01:00.000Z", acquisitionMethod: "api" as const, transformationSteps: [] }],
    geometryConfidence: 0.9, attributeConfidence: 0.8, overallConfidence: 0.85,
    missingFields: [], validationWarnings: [], preferred: true, version: 1, createdAt: "2026-07-20T10:01:00.000Z", updatedAt: "2026-07-20T10:01:00.000Z",
  };
  return {
    ingestionRun: { id: "run-1", projectId: "project-1", territoryId: "territory-1", requestedDomains: ["building"], sourceIds: ["osm"], status, startedAt: "2026-07-20T10:00:00.000Z", finishedAt: "2026-07-20T10:02:00.000Z", rawRecordIds: ["raw-1"], canonicalSnapshotId: "snapshot-1", qualityReportId: "quality-1", errors: [], warnings: [] },
    snapshot: { id: "snapshot-1", projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", createdAt: "2026-07-20T10:02:00.000Z", version: 1, features: [feature] },
    quality: { id: "quality-1", projectId: "project-1", territoryId: "territory-1", canonicalSnapshotId: "snapshot-1", createdAt: "2026-07-20T10:03:00.000Z", overallStatus: "partial", overallScore: null, domains: {} },
  };
}

function existingProject() {
  const project = createEmptyFormiqProject();
  project.id = "project-1";
  project.activeTerritoryId = "territory-1";
  project.territories = [{ id: "territory-1", name: "Territory", type: "working-area", geometry: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[37.5, 55.7], [37.55, 55.7], [37.55, 55.75], [37.5, 55.7]]] } }, bounds, loadingBuffer: { distanceMeters: 0 }, analysisSettings: { includeBufferInImport: false, calculateOnlyInsideWorkingArea: true }, thematicMapIds: [], analysisResultIds: [], createdAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-20T09:00:00.000Z", isActive: true, status: "ready", locked: false }];
  return project;
}
