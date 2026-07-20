import { describe, expect, it, vi } from "vitest";
import { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import { DataFusionEngine } from "@/lib/gis-engine/fusion/DataFusionEngine";
import { createDataHub } from "./DataHubFactory";
import type { CanonicalRepository, IngestionRunRepository, QualityRepository, RawDataRepository } from "./repositories";
import type {
  CanonicalQuery,
  CanonicalQueryResult,
  CanonicalSnapshot,
  IngestionPipelineApi,
  IngestionRun,
  NormalizedSourceDataset,
  QualityReport,
  RawDataRecord,
  RefreshTerritoryRequest,
} from "./types";
import type { DataHubLogEvent, DataHubLogger } from "./Observability";

const timestamp = "2026-07-20T12:00:00.000Z";
const request: RefreshTerritoryRequest = {
  projectId: "project-1",
  territory: {
    id: "territory-1", projectId: "project-1",
    geometry: { type: "Polygon", coordinates: [[[37, 55], [39, 55], [39, 57], [37, 55]]] },
    bbox: [37, 55, 39, 57], crs: "EPSG:4326",
  },
  domains: ["building"],
};

describe("DataHub refresh wiring", () => {
  it("runs ingestion, canonical fusion, snapshot save and quality save as one complete result", async () => {
    const registry = new SourceRegistry();
    const engine = new DataSourceEngine(registry);
    const health = new SourceHealthMonitor(engine);
    vi.spyOn(health, "getStates").mockReturnValue([{ source: "osm", status: "ready", checkedAt: timestamp }]);
    const repositories = createRepositories();
    const run = ingestionRun();
    const raw = rawRecord();
    const normalized = normalizedDataset();
    const ingestionPipeline: IngestionPipelineApi = {
      run: vi.fn(async () => {
        await repositories.ingestionRuns.create(run);
        await repositories.rawData.save(raw);
        return { run, normalized: [normalized] };
      }),
    };
    const hub = createDataHub({
      sourceRegistry: registry,
      dataSourceEngine: engine,
      dataFusionEngine: new DataFusionEngine(null),
      sourceHealthMonitor: health,
      ingestionPipeline,
      repositories,
    });

    const result = await hub.refreshTerritory(request);

    expect(ingestionPipeline.run).toHaveBeenCalledWith(request, expect.objectContaining({
      signal: undefined,
      onProgress: expect.any(Function),
    }));
    expect(result.snapshot.features).toHaveLength(1);
    expect(result.snapshot.features[0]).toMatchObject({ domain: "building", preferred: true });
    expect(result.quality).toMatchObject({ canonicalSnapshotId: result.snapshot.id, overallStatus: "complete" });
    expect(result.ingestionRun).toMatchObject({
      canonicalSnapshotId: result.snapshot.id,
      qualityReportId: result.quality.id,
    });
    expect(repositories.canonical.snapshots).toHaveLength(1);
    expect(repositories.quality.reports).toHaveLength(1);
    await expect(hub.queryCanonical({ projectId: "project-1", territoryId: "territory-1" })).resolves.toMatchObject({
      snapshotId: result.snapshot.id,
      quality: { id: result.quality.id },
    });
  });

  it("deduplicates concurrent refreshes for the same project and territory", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const harness = createHubHarness(async () => {
      await gate;
      await harness.repositories.ingestionRuns.create(ingestionRun());
      await harness.repositories.rawData.save(rawRecord());
      return { run: ingestionRun(), normalized: [normalizedDataset()] };
    });
    const first = harness.hub.refreshTerritory(request);
    const second = harness.hub.refreshTerritory(request);
    await vi.waitFor(() => expect(harness.run).toHaveBeenCalledTimes(1));
    release();
    const [left, right] = await Promise.all([first, second]);
    expect(right.snapshot.id).toBe(left.snapshot.id);
    expect(harness.logger.events.some((event) => event.details?.deduplicated === true)).toBe(true);
  });

  it("returns a diagnostic territory status without raw payloads or secrets", async () => {
    const run = { ...ingestionRun(), sourcePolicyDecisions: [{ domain: "building" as const, selectedSourceIds: ["osm"], rejectedSourceIds: [], fallbackSourceIds: [], reasons: { osm: ["available"] }, requiresManualReview: false }] };
    const harness = createHubHarness(async () => {
      await harness.repositories.ingestionRuns.create(run);
      await harness.repositories.rawData.save({ ...rawRecord(), sourceMetadata: { token: "must-not-be-logged", coverageScore: 0.8 } });
      return { run, normalized: [normalizedDataset()] };
    });
    await harness.hub.refreshTerritory(request);
    const status = await harness.hub.getTerritoryDataStatus({ projectId: "project-1", territoryId: "territory-1" });
    expect(status.latestSnapshot).not.toBeNull();
    expect(status.sourceChain[0]?.selectedSourceIds).toEqual(["osm"]);
    expect(status.domainStatuses.building?.overallScore).toBeNull();
    expect(status.domainStatuses.building?.measurement).toBe("unknown");
    expect(JSON.stringify(harness.logger.events)).not.toContain("must-not-be-logged");
    expect(harness.logger.events.map((event) => event.operation)).toEqual(expect.arrayContaining(["source_selection", "fusion", "quality", "analysis_context"]));
  });

  it("validates request ownership, domains and bbox before ingestion", async () => {
    const harness = createHubHarness(async () => ({ run: ingestionRun(), normalized: [] }));
    await expect(harness.hub.refreshTerritory({ ...request, projectId: "wrong-project" })).rejects.toThrow("does not match");
    await expect(harness.hub.refreshTerritory({ ...request, domains: [] })).rejects.toThrow("at least one domain");
    await expect(harness.hub.refreshTerritory({ ...request, territory: { ...request.territory, bbox: [1, 0, 0, 1] } })).rejects.toThrow("invalid territory bbox");
    expect(harness.run).not.toHaveBeenCalled();
  });
});

function createHubHarness(runImplementation: IngestionPipelineApi["run"]) {
  const registry = new SourceRegistry();
  const engine = new DataSourceEngine(registry);
  const health = new SourceHealthMonitor(engine);
  vi.spyOn(health, "getStates").mockReturnValue([{ source: "osm", status: "ready", checkedAt: timestamp }]);
  const repositories = createRepositories();
  const run = vi.fn(runImplementation);
  const logger = new MemoryLogger();
  const hub = createDataHub({ sourceRegistry: registry, dataSourceEngine: engine, dataFusionEngine: new DataFusionEngine(null), sourceHealthMonitor: health, ingestionPipeline: { run }, repositories, logger });
  return { hub, run, repositories, logger };
}

class MemoryLogger implements DataHubLogger {
  events: DataHubLogEvent[] = [];
  emit(event: DataHubLogEvent): void { this.events.push(structuredClone(event)); }
}

function createRepositories() {
  return {
    rawData: new MemoryRawRepository(),
    ingestionRuns: new MemoryRunRepository(),
    canonical: new MemoryCanonicalRepository(),
    quality: new MemoryQualityRepository(),
  };
}

function ingestionRun(): IngestionRun {
  return { id: "run-1", projectId: "project-1", territoryId: "territory-1", requestedDomains: ["building"], sourceIds: ["osm"], status: "completed", startedAt: timestamp, finishedAt: timestamp, rawRecordIds: ["raw-1"], errors: [], warnings: [] };
}

function rawRecord(): RawDataRecord {
  return {
    id: "raw-1", ingestionRunId: "run-1", projectId: "project-1", territoryId: "territory-1", sourceId: "osm", domain: "building", receivedAt: timestamp,
    sourceMetadata: {
      coverageByDomain: { building: { score: 0.8, measurement: "measured" } },
      freshnessMaxAgeDaysBySource: { osm: 30 },
      reliabilityBySource: { osm: 0.8 },
    },
    payload: { format: "overpass", responses: [] },
  };
}

function normalizedDataset(): NormalizedSourceDataset {
  return {
    sourceId: "osm", domain: "building", rawRecordIds: ["raw-1"], issues: [], startedAt: timestamp, finishedAt: timestamp,
    features: [{
      sourceFeatureId: "osm-way-1", domain: "building",
      geometry: { type: "Polygon", coordinates: [[[37.2, 55.2], [37.3, 55.2], [37.3, 55.3], [37.2, 55.2]]] },
      attributes: { objectType: "apartments", height: 15, levels: 5, tags: { building: "apartments" } },
      provenance: { sourceId: "osm", sourceType: "osm", sourceFeatureId: "osm-way-1", acquiredAt: timestamp, processedAt: timestamp, acquisitionMethod: "api", rawRecordId: "raw-1", transformationSteps: [] },
      geometryConfidence: 0.9, attributeConfidence: 0.9, missingFields: [], validationWarnings: [],
    }],
  };
}

class MemoryRawRepository implements RawDataRepository {
  records: RawDataRecord[] = [];
  async save(value: RawDataRecord) { this.records.push(structuredClone(value)); }
  async saveMany(values: RawDataRecord[]) { for (const value of values) await this.save(value); }
  async get(id: string) { return this.records.find((item) => item.id === id) ?? null; }
  async listByRun(runId: string) { return this.records.filter((item) => item.ingestionRunId === runId); }
  async listByTerritory(input: { projectId: string; territoryId: string }) { return this.records.filter((item) => item.projectId === input.projectId && item.territoryId === input.territoryId); }
  async deleteByProject(projectId: string) { this.records = this.records.filter((item) => item.projectId !== projectId); }
}

class MemoryRunRepository implements IngestionRunRepository {
  runs: IngestionRun[] = [];
  async create(value: IngestionRun) { this.runs.push(structuredClone(value)); }
  async update(value: IngestionRun) { this.runs = [...this.runs.filter((item) => item.id !== value.id), structuredClone(value)]; }
  async get(id: string) { return this.runs.find((item) => item.id === id) ?? null; }
  async getLatest(input: { projectId: string; territoryId: string }) { return this.runs.filter((item) => item.projectId === input.projectId && item.territoryId === input.territoryId).at(-1) ?? null; }
  async listByProject(projectId: string) { return this.runs.filter((item) => item.projectId === projectId); }
}

class MemoryCanonicalRepository implements CanonicalRepository {
  snapshots: CanonicalSnapshot[] = [];
  async saveSnapshot(value: CanonicalSnapshot) { this.snapshots.push(structuredClone(value)); }
  async getSnapshot(id: string) { return this.snapshots.find((item) => item.id === id) ?? null; }
  async getLatestSnapshot(input: { projectId: string; territoryId: string }) { return this.snapshots.filter((item) => item.projectId === input.projectId && item.territoryId === input.territoryId).at(-1) ?? null; }
  async query(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    const current = await this.getLatestSnapshot(query);
    return current ? { snapshotId: current.id, features: current.features } : { snapshotId: "", features: [] };
  }
  async deleteByProject(projectId: string) { this.snapshots = this.snapshots.filter((item) => item.projectId !== projectId); }
}

class MemoryQualityRepository implements QualityRepository {
  reports: QualityReport[] = [];
  async save(value: QualityReport) { this.reports.push(structuredClone(value)); }
  async get(id: string) { return this.reports.find((item) => item.id === id) ?? null; }
  async getLatest(input: { projectId: string; territoryId: string }) { return this.reports.filter((item) => item.projectId === input.projectId && item.territoryId === input.territoryId).at(-1) ?? null; }
  async listByProject(projectId: string) { return this.reports.filter((item) => item.projectId === projectId); }
}
