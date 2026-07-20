import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange as FakeIDBKeyRange } from "fake-indexeddb";
import { createFormiqProject } from "@/lib/gis-engine/projectBuilder";
import {
  closeFormiqDatabaseConnection,
  DATA_HUB_STORES,
  FORMIQ_DATABASE_NAME,
  FORMIQ_DATABASE_VERSION,
  getFormiqDatabase,
  IndexedDbProjectStorage,
} from "@/lib/storage/indexedDbProjectStorage";
import type {
  CanonicalFeature,
  CanonicalSnapshot,
  IngestionRun,
  QualityReport,
  RawDataRecord,
} from "../types";
import { IndexedDbCanonicalRepository } from "./IndexedDbCanonicalRepository";
import { IndexedDbIngestionRunRepository } from "./IndexedDbIngestionRunRepository";
import { IndexedDbQualityRepository } from "./IndexedDbQualityRepository";
import { IndexedDbRawDataRepository } from "./IndexedDbRawDataRepository";
import { IndexedDbAgentJobRepository } from "../agents/AgentJobRepository";

beforeEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", FakeIDBKeyRange);
});

afterEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.unstubAllGlobals();
});

describe("Data Hub IndexedDB repositories", () => {
  it("upgrades schema version 2 without deleting an existing project or map chunk stores", async () => {
    const project = createFormiqProject({ name: "Existing project" });
    const oldDatabase = await openVersionTwoDatabase();
    await putDirect(oldDatabase, "projects", project);
    oldDatabase.close();

    const loaded = await new IndexedDbProjectStorage().loadProject(project.id);
    const database = await getFormiqDatabase();

    expect(database.version).toBe(FORMIQ_DATABASE_VERSION);
    expect(loaded?.name).toBe("Existing project");
    expect(Array.from(database.objectStoreNames)).toEqual(expect.arrayContaining([
      "projects", "metadata", "layer-chunks", "layer-chunk-manifests", ...Object.values(DATA_HUB_STORES),
    ]));
    expect(indexNames(database, DATA_HUB_STORES.RAW_RECORDS)).toEqual(expect.arrayContaining([
      "ingestionRunId", "projectId", "territoryId", "sourceId", "domain", "receivedAt",
    ]));
    expect(indexNames(database, DATA_HUB_STORES.CANONICAL_SNAPSHOTS)).toEqual(expect.arrayContaining([
      "projectId", "territoryId", "createdAt", "version",
    ]));
  });

  it("persists immutable raw records and reads refresh history by run and territory", async () => {
    const repository = new IndexedDbRawDataRepository();
    const record = rawRecord("raw-1", "project-1", "territory-1", "run-1");
    await repository.save(record);
    (record.payload as { value: number }).value = 99;

    expect(await repository.get("raw-1")).toMatchObject({ payload: { value: 1 } });
    expect(await repository.listByRun("run-1")).toHaveLength(1);
    expect(await repository.listByTerritory({
      projectId: "project-1", territoryId: "territory-1", sourceId: "osm", domain: "building",
    })).toHaveLength(1);
    await expect(repository.save(record)).rejects.toBeTruthy();
  });

  it("writes raw records in one repository batch for multi-source refreshes", async () => {
    const repository = new IndexedDbRawDataRepository();
    const records = Array.from({ length: 250 }, (_, index) => rawRecord(`raw-batch-${index}`, "project-batch", "territory-batch", "run-batch"));
    await repository.saveMany(records);
    expect(await repository.listByRun("run-batch")).toHaveLength(250);
  });

  it("keeps canonical snapshots immutable and resolves latest and domain queries deterministically", async () => {
    const repository = new IndexedDbCanonicalRepository();
    const first = snapshot("snapshot-1", "project-1", "territory-1", 1, "2026-07-20T10:00:00.000Z", [
      feature("building-1", "building"), feature("road-1", "road"),
    ]);
    const second = snapshot("snapshot-2", "project-1", "territory-1", 2, "2026-07-20T11:00:00.000Z", [
      feature("building-2", "building"), feature("road-2", "road"),
    ]);
    await repository.saveSnapshot(first);
    await repository.saveSnapshot(second);
    second.features[0]!.attributes.name = "mutated-runtime-value";

    expect((await repository.getSnapshot("snapshot-2"))?.features[0]?.attributes.name).toBe("building-2");
    expect((await repository.getLatestSnapshot({ projectId: "project-1", territoryId: "territory-1" }))?.id).toBe("snapshot-2");
    expect((await repository.query({
      projectId: "project-1", territoryId: "territory-1", domains: ["road"],
    })).features.map((item) => item.id)).toEqual(["road-2"]);
    await expect(repository.saveSnapshot({ ...second, id: "snapshot-duplicate" })).rejects.toThrow("greater than");
  });

  it("persists mutable ingestion runs and immutable quality reports", async () => {
    const runs = new IndexedDbIngestionRunRepository();
    const quality = new IndexedDbQualityRepository();
    const run = ingestionRun("run-1", "project-1", "territory-1", "running");
    await runs.create(run);
    await runs.update({ ...run, status: "completed", finishedAt: "2026-07-20T10:10:00.000Z" });
    await quality.save(qualityReport("quality-1", "project-1", "territory-1", "snapshot-1"));

    expect((await runs.get("run-1"))?.status).toBe("completed");
    expect((await runs.getLatest({ projectId: "project-1", territoryId: "territory-1" }))?.id).toBe("run-1");
    expect((await quality.getLatest({ projectId: "project-1", territoryId: "territory-1" }))?.id).toBe("quality-1");
    await expect(quality.save(qualityReport("quality-1", "project-1", "territory-1", "snapshot-1"))).rejects.toBeTruthy();
  });

  it("restores canonical snapshots and acquisition jobs after a database reconnect", async () => {
    const canonical = new IndexedDbCanonicalRepository();
    const jobs = new IndexedDbAgentJobRepository();
    await canonical.saveSnapshot(snapshot("snapshot-reload", "project-1", "territory-1", 1, "2026-07-20T12:00:00.000Z", [feature("building-reload", "building")]));
    await jobs.create({ id: "job-reload", projectId: "project-1", territoryId: "territory-1", requestedDomains: ["building"], requirements: [{ domain: "building", required: true }], status: "waiting_manual_review", attempt: 1, maxAttempts: 3, decisions: [], ingestionRunIds: [], createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:01:00.000Z", errors: [], warnings: [] });
    await closeFormiqDatabaseConnection();

    expect((await new IndexedDbCanonicalRepository().getLatestSnapshot({ projectId: "project-1", territoryId: "territory-1" }))?.id).toBe("snapshot-reload");
    expect((await new IndexedDbAgentJobRepository().get("job-reload"))?.status).toBe("waiting_manual_review");
  });

  it("deletes one project's Data Hub history without touching another project", async () => {
    const projects = new IndexedDbProjectStorage();
    const raw = new IndexedDbRawDataRepository();
    const canonical = new IndexedDbCanonicalRepository();
    const runs = new IndexedDbIngestionRunRepository();
    const quality = new IndexedDbQualityRepository();
    const firstProject = createFormiqProject({ name: "First" });
    const secondProject = createFormiqProject({ name: "Second" });
    await projects.saveProjectRecord(firstProject);
    await projects.saveProjectRecord(secondProject);

    for (const [projectId, suffix] of [[firstProject.id, "1"], [secondProject.id, "2"]] as const) {
      await raw.save(rawRecord(`raw-${suffix}`, projectId, "territory-1", `run-${suffix}`));
      await runs.create(ingestionRun(`run-${suffix}`, projectId, "territory-1", "completed"));
      await canonical.saveSnapshot(snapshot(
        `snapshot-${suffix}`, projectId, "territory-1", 1, `2026-07-20T1${suffix}:00:00.000Z`, [feature(`building-${suffix}`, "building", projectId)]
      ));
      await quality.save(qualityReport(`quality-${suffix}`, projectId, "territory-1", `snapshot-${suffix}`));
    }

    await projects.deleteProject(firstProject.id);

    expect(await projects.loadProject(firstProject.id)).toBeNull();
    expect(await projects.loadProject(secondProject.id)).not.toBeNull();
    expect(await raw.listByTerritory({ projectId: firstProject.id, territoryId: "territory-1" })).toHaveLength(0);
    expect(await runs.listByProject(firstProject.id)).toHaveLength(0);
    expect(await canonical.getLatestSnapshot({ projectId: firstProject.id, territoryId: "territory-1" })).toBeNull();
    expect(await quality.listByProject(firstProject.id)).toHaveLength(0);
    expect(await raw.listByTerritory({ projectId: secondProject.id, territoryId: "territory-1" })).toHaveLength(1);
    expect(await canonical.getLatestSnapshot({ projectId: secondProject.id, territoryId: "territory-1" })).not.toBeNull();
  });
});

function rawRecord(id: string, projectId: string, territoryId: string, ingestionRunId: string): RawDataRecord {
  return {
    id, ingestionRunId, projectId, territoryId, sourceId: "osm", domain: "building",
    receivedAt: "2026-07-20T10:00:00.000Z", sourceMetadata: {}, payload: { value: 1 },
  };
}

function ingestionRun(
  id: string,
  projectId: string,
  territoryId: string,
  status: IngestionRun["status"]
): IngestionRun {
  return {
    id, projectId, territoryId, requestedDomains: ["building"], sourceIds: ["osm"], status,
    startedAt: "2026-07-20T10:00:00.000Z", rawRecordIds: [], errors: [], warnings: [],
  };
}

function feature(
  id: string,
  domain: CanonicalFeature["domain"],
  projectId = "project-1"
): CanonicalFeature {
  return {
    id, domain, geometry: { type: "Point", coordinates: [37.6, 55.75] }, attributes: { name: id },
    projectId, territoryId: "territory-1", provenance: [], geometryConfidence: 1,
    attributeConfidence: 1, overallConfidence: 1, missingFields: [], validationWarnings: [],
    preferred: true, version: 1, createdAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

function snapshot(
  id: string,
  projectId: string,
  territoryId: string,
  version: number,
  createdAt: string,
  features: CanonicalFeature[]
): CanonicalSnapshot {
  return { id, projectId, territoryId, ingestionRunId: `run-${version}`, createdAt, version, features };
}

function qualityReport(
  id: string,
  projectId: string,
  territoryId: string,
  canonicalSnapshotId: string
): QualityReport {
  return {
    id, projectId, territoryId, canonicalSnapshotId, createdAt: "2026-07-20T10:00:00.000Z",
    overallStatus: "complete", overallScore: 1, domains: {},
  };
}

function openVersionTwoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FORMIQ_DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("projects", { keyPath: "id" });
      database.createObjectStore("metadata", { keyPath: "id" });
      const chunks = database.createObjectStore("layer-chunks", { keyPath: "id" });
      chunks.createIndex("projectId", "projectId", { unique: false });
      const manifests = database.createObjectStore("layer-chunk-manifests", { keyPath: "id" });
      manifests.createIndex("projectId", "projectId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putDirect(database: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function indexNames(database: IDBDatabase, storeName: string): string[] {
  const transaction = database.transaction(storeName, "readonly");
  return Array.from(transaction.objectStore(storeName).indexNames);
}
