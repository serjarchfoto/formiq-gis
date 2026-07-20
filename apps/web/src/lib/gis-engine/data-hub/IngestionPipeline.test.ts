import { describe, expect, it, vi } from "vitest";
import { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import { SourceAdapterDataSource } from "@/lib/gis-engine/data-source/SourceAdapterDataSource";
import { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import { SourceManager } from "@/lib/gis-engine/fusion/SourceManager";
import type { SourceAdapter, SourceAdapterRawResult, SourceAdapterResult, SourceFeature } from "@/lib/gis-engine/fusion/types";
import type { DataSourceKind } from "@/types/formiq";
import type { IngestionRunRepository, RawDataRepository } from "./repositories";
import { IngestionPipeline, IngestionPipelineError } from "./IngestionPipeline";
import type {
  IngestionProgressEvent,
  IngestionRun,
  NormalizationPipelineApi,
  NormalizedSourceDataset,
  RawDataRecord,
  RefreshTerritoryRequest,
} from "./types";

const request: RefreshTerritoryRequest = {
  projectId: "project-1",
  territory: {
    id: "territory-1",
    projectId: "project-1",
    geometry: { type: "Polygon", coordinates: [[[37.5, 55.7], [37.7, 55.7], [37.7, 55.8], [37.5, 55.7]]] },
    bbox: [37.5, 55.7, 37.7, 55.8],
    crs: "EPSG:4326",
  },
  domains: ["building"],
};

describe("Data Hub IngestionPipeline", () => {
  it("persists raw before normalization and emits progress in stage order", async () => {
    const order: string[] = [];
    const harness = createHarness([
      rawAdapter("osm", async () => rawResult("osm")),
    ], {
      onRawSave: () => order.push("raw-save"),
      onNormalize: () => order.push("normalize"),
    });
    const progress: IngestionProgressEvent[] = [];
    const result = await harness.pipeline.run(request, { onProgress: (event) => progress.push(event) });

    expect(result.run.status).toBe("completed");
    expect(result.normalized).toHaveLength(1);
    expect(order).toEqual(["raw-save", "normalize"]);
    expect(progress.map((event) => event.stage)).toEqual([
      "planning", "health_check", "fetching", "raw_persisted", "normalizing", "normalizing", "completed",
    ]);
    expect(harness.runRepository.history.map((run) => run.status)).toEqual(expect.arrayContaining(["created", "running", "completed"]));
    expect(result.run.rawRecordIds).toHaveLength(1);
  });

  it("continues from a failed primary source to the existing fallback policy", async () => {
    const harness = createHarness([
      rawAdapter("osm", async () => { throw new Error("primary unavailable"); }),
      rawAdapter("microsoft-buildings", async () => rawResult("microsoft-buildings")),
    ]);
    const result = await harness.pipeline.run(request);

    expect(result.run.status).toBe("partial");
    expect(result.run.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SOURCE_UNAVAILABLE", sourceId: "osm", domain: "building" }),
    ]));
    expect(result.normalized.at(-1)?.sourceId).toBe("microsoft-buildings");
  });

  it("isolates one failed domain while preserving successful domains", async () => {
    const harness = createHarness([
      rawAdapter("osm", async () => rawResult("osm")),
      rawAdapter("copernicus-dem", async () => { throw new Error("terrain unavailable"); }),
    ]);
    const result = await harness.pipeline.run({ ...request, domains: ["building", "terrain"] });

    expect(result.run.status).toBe("partial");
    expect(result.normalized.map((dataset) => dataset.domain)).toContain("building");
    expect(result.run.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DOMAIN_PARTIAL", domain: "terrain" }),
    ]));
  });

  it("records rate limiting and finishes failed when no fallback is registered", async () => {
    const harness = createHarness([
      rawAdapter("osm", async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); }),
    ]);
    const result = await harness.pipeline.run(request);

    expect(result.run.status).toBe("failed");
    expect(result.run.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "SOURCE_RATE_LIMITED", "ALL_SOURCES_FAILED",
    ]));
  });

  it("updates the journal to cancelled and rejects when the signal is aborted", async () => {
    const harness = createHarness([rawAdapter("osm", async () => rawResult("osm"))]);
    const controller = new AbortController();
    controller.abort();

    await expect(harness.pipeline.run(request, { signal: controller.signal })).rejects.toMatchObject({
      name: "IngestionPipelineError",
      code: "INGESTION_ABORTED",
    } satisfies Partial<IngestionPipelineError>);
    expect(harness.runRepository.current?.status).toBe("cancelled");
    expect(harness.runRepository.current?.errors.at(-1)?.code).toBe("INGESTION_ABORTED");
  });

  it("marks legacy-normalized fallback in warnings and provenance", async () => {
    const harness = createHarness([legacyAdapter("osm")]);
    const result = await harness.pipeline.run(request);
    const dataset = result.normalized[0]!;

    expect(dataset.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LEGACY_NORMALIZED_FALLBACK" }),
    ]));
    expect(dataset.features[0]?.provenance.transformationSteps).toContain("legacy-normalized-fallback");
    expect(harness.rawRepository.records[0]?.sourceMetadata.usedLegacyNormalization).toBe(true);
  });
});

function createHarness(
  adapters: SourceAdapter[],
  hooks: { onRawSave?: () => void; onNormalize?: () => void } = {}
) {
  const registry = new SourceRegistry();
  adapters.forEach((adapter) => registry.register(new SourceAdapterDataSource(adapter, adapter.source, "online")));
  const engine = new DataSourceEngine(registry);
  const rawRepository = new FakeRawRepository(hooks.onRawSave);
  const runRepository = new FakeRunRepository();
  const normalizationPipeline: NormalizationPipelineApi = {
    normalize: vi.fn(async ({ envelope, rawRecord }) => {
      hooks.onNormalize?.();
      const legacy = envelope.legacyNormalizedPayload as SourceAdapterResult | undefined;
      const featureSource = envelope.sourceId as DataSourceKind;
      const sourceFeatures = legacy?.features ?? [sourceFeature(featureSource, envelope.domain)];
      const now = new Date().toISOString();
      return {
        sourceId: envelope.sourceId,
        domain: envelope.domain,
        rawRecordIds: [rawRecord.id],
        features: sourceFeatures.map((feature) => ({
          sourceFeatureId: feature.sourceFeatureId,
          domain: envelope.domain,
          geometry: feature.geometry,
          attributes: { tags: feature.tags },
          provenance: {
            sourceId: envelope.sourceId,
            sourceType: String(envelope.metadata.sourceType ?? envelope.sourceId),
            sourceFeatureId: feature.sourceFeatureId,
            acquiredAt: rawRecord.receivedAt,
            processedAt: now,
            acquisitionMethod: envelope.usedLegacyNormalization ? "legacy" : "api",
            rawRecordId: rawRecord.id,
            transformationSteps: [],
          },
          geometryConfidence: 0.8,
          attributeConfidence: 0.7,
          missingFields: [],
          validationWarnings: [],
        })),
        issues: [],
        startedAt: now,
        finishedAt: now,
      } satisfies NormalizedSourceDataset;
    }),
  };
  const sourceManager = new SourceManager(engine);
  return {
    pipeline: new IngestionPipeline({
      sourceRegistry: registry,
      dataSourceEngine: engine,
      sourceManager,
      sourceHealthMonitor: new SourceHealthMonitor(engine),
      rawRepository,
      ingestionRunRepository: runRepository,
      normalizationPipeline,
    }),
    rawRepository,
    runRepository,
  };
}

function rawAdapter(
  source: DataSourceKind,
  fetchRaw: () => Promise<SourceAdapterRawResult>
): SourceAdapter {
  return {
    source,
    version: "test-v1",
    fetchRaw: vi.fn(fetchRaw),
    fetch: vi.fn(async () => ({ source, version: "test-v1", features: [sourceFeature(source, "building")] })),
  };
}

function legacyAdapter(source: DataSourceKind): SourceAdapter {
  return {
    source,
    version: "legacy-v1",
    fetch: vi.fn(async () => ({ source, version: "legacy-v1", features: [sourceFeature(source, "building")] })),
  };
}

function rawResult(source: DataSourceKind): SourceAdapterRawResult {
  return {
    source,
    version: "test-v1",
    payload: { format: "source-features", features: [sourceFeature(source, "building")] },
    metadata: { status: "ready" },
  };
}

function sourceFeature(source: DataSourceKind, domain: RefreshTerritoryRequest["domains"][number]): SourceFeature {
  const kind = domain === "terrain" ? "terrain" : "building";
  if (kind === "terrain") {
    return {
      source, sourceFeatureId: `${source}-terrain`, kind, geometry: { type: "Point", coordinates: [37.6, 55.75] },
      tags: {}, elevation: 100,
    };
  }
  return {
    source, sourceFeatureId: `${source}-building`, kind, geometry: {
      type: "Polygon", coordinates: [[[37.5, 55.7], [37.6, 55.7], [37.6, 55.8], [37.5, 55.7]]],
    }, tags: { building: "yes" },
  };
}

class FakeRawRepository implements RawDataRepository {
  readonly records: RawDataRecord[] = [];
  constructor(private readonly onSave?: () => void) {}
  async save(record: RawDataRecord) { this.records.push(structuredClone(record)); this.onSave?.(); }
  async saveMany(records: RawDataRecord[]) { for (const record of records) await this.save(record); }
  async get(id: string) { return this.records.find((record) => record.id === id) ?? null; }
  async listByRun(runId: string) { return this.records.filter((record) => record.ingestionRunId === runId); }
  async listByTerritory(input: { projectId: string; territoryId: string }) {
    return this.records.filter((record) => record.projectId === input.projectId && record.territoryId === input.territoryId);
  }
  async deleteByProject(projectId: string) { this.records.splice(0, this.records.length, ...this.records.filter((record) => record.projectId !== projectId)); }
}

class FakeRunRepository implements IngestionRunRepository {
  readonly history: IngestionRun[] = [];
  current: IngestionRun | null = null;
  async create(run: IngestionRun) { this.current = structuredClone(run); this.history.push(structuredClone(run)); }
  async update(run: IngestionRun) { this.current = structuredClone(run); this.history.push(structuredClone(run)); }
  async get(id: string) { return this.current?.id === id ? structuredClone(this.current) : null; }
  async getLatest() { return this.current ? structuredClone(this.current) : null; }
  async listByProject(projectId: string) { return this.current?.projectId === projectId ? [structuredClone(this.current)] : []; }
}
