import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange as FakeIDBKeyRange } from "fake-indexeddb";
import { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import { SourceAdapterDataSource } from "@/lib/gis-engine/data-source/SourceAdapterDataSource";
import { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import { SourceManager } from "@/lib/gis-engine/fusion/SourceManager";
import type { SourceAdapter } from "@/lib/gis-engine/fusion/types";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import { closeFormiqDatabaseConnection } from "@/lib/storage/indexedDbProjectStorage";
import { CanonicalProjectProjection } from "./CanonicalProjectProjection";
import { createDataHub, createIndexedDbDataHubRepositories } from "./DataHubFactory";
import { IngestionPipeline } from "./IngestionPipeline";
import { NormalizationPipeline } from "./NormalizationPipeline";
import type { TerritoryReference } from "./types";

beforeEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", FakeIDBKeyRange);
});

afterEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.unstubAllGlobals();
});

describe("Data Hub production integration", () => {
  it("runs fake source through raw storage, canonical snapshot, projection and analysis context", async () => {
    const project = createEmptyFormiqProject();
    const territory: TerritoryReference = { id: "territory-e2e", projectId: project.id, bbox: [0, 0, 1, 1], crs: "EPSG:4326", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
    const adapter: SourceAdapter = {
      source: "city-geojson",
      version: "fixture-v1",
      fetchRaw: vi.fn(async () => ({ source: "city-geojson", version: "fixture-v1", payload: { type: "FeatureCollection", features: [{ type: "Feature", id: "building-1", properties: { building: "apartments", levels: 5 }, geometry: { type: "Polygon", coordinates: [[[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.1]]] } }] }, metadata: { status: "ready", inputCrs: "EPSG:4326", coverageScore: 0.7, reliabilityScore: 0.8 } })),
      fetch: vi.fn(async () => ({ source: "city-geojson", version: "fixture-v1", features: [] })),
    };
    const registry = new SourceRegistry().register(new SourceAdapterDataSource(adapter, "Fixture city data", "online"));
    const engine = new DataSourceEngine(registry);
    const health = new SourceHealthMonitor(engine);
    const repositories = createIndexedDbDataHubRepositories();
    const ingestion = new IngestionPipeline({ sourceRegistry: registry, dataSourceEngine: engine, sourceManager: new SourceManager(engine), sourceHealthMonitor: health, rawRepository: repositories.rawData, ingestionRunRepository: repositories.ingestionRuns, normalizationPipeline: new NormalizationPipeline() });
    const hub = createDataHub({ sourceRegistry: registry, dataSourceEngine: engine, sourceHealthMonitor: health, ingestionPipeline: ingestion, repositories });

    const refresh = await hub.refreshTerritory({ projectId: project.id, territory, domains: ["building"], preferredSourceIds: ["city-geojson"] });
    expect(await repositories.rawData.listByRun(refresh.ingestionRun.id)).toHaveLength(1);
    expect(refresh.snapshot.features).toHaveLength(1);
    expect(refresh.snapshot.version).toBe(1);
    expect(refresh.quality.overallScore).not.toBe(1);

    const projectStoreValue = await new CanonicalProjectProjection().projectSnapshot({ existingProject: project, canonicalSnapshot: refresh.snapshot, quality: refresh.quality, territory });
    expect(projectStoreValue.buildings).toHaveLength(1);
    const context = await hub.queryAnalysisContext({ projectId: project.id, territoryId: territory.id, requirements: [{ domain: "building", required: true }] });
    expect(context.features.building).toHaveLength(1);
    expect(context.ready || context.degraded).toBe(true);
  });
});
