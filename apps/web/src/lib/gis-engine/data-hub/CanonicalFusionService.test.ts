import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import { CanonicalFusionService } from "./CanonicalFusionService";
import { CanonicalSnapshotBuilder } from "./CanonicalSnapshotBuilder";
import type { CanonicalRepository, IngestionRunRepository } from "./repositories";
import type {
  CanonicalDomain,
  CanonicalFeature,
  CanonicalQuery,
  CanonicalQueryResult,
  CanonicalSnapshot,
  IngestionRun,
  NormalizedSourceDataset,
  NormalizedSourceFeature,
} from "./types";

const timestamp = "2026-07-20T12:00:00.000Z";
const buildingGeometry: Geometry = {
  type: "Polygon",
  coordinates: [[[37, 55], [38, 55], [38, 56], [37, 55]]],
};

describe("CanonicalFusionService", () => {
  it("preserves duplicate building candidates, provenance and the existing preferred-source decision", async () => {
    const service = new CanonicalFusionService();
    const result = await service.fuse({
      projectId: "project-1",
      territoryId: "territory-1",
      ingestionRunId: "run-1",
      datasets: [
        dataset("osm", "building", [feature("osm-building-1", "building", buildingGeometry, { height: 15, levels: 5 })]),
        dataset("microsoft-buildings", "building", [feature("ms-building-1", "building", buildingGeometry, { height: 18 })]),
      ],
    });

    expect(result.features).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.candidateFeatureIds).toHaveLength(2);
    const preferred = result.features.find((item) => item.preferred);
    const alternate = result.features.find((item) => !item.preferred);
    expect(preferred?.provenance[0]?.sourceId).toBe("osm");
    expect(preferred?.provenance.map((item) => item.sourceId)).toEqual(["osm", "microsoft-buildings"]);
    expect(alternate?.provenance.map((item) => item.sourceId)).toEqual(["microsoft-buildings"]);
    expect(result.conflicts[0]?.preferredFeatureId).toBe(preferred?.id);
    expect(result.conflicts[0]?.reason).toContain("FusionPriorityRegistry");
  });

  it("does not merge two nearby but distinct roads", async () => {
    const service = new CanonicalFusionService();
    const result = await service.fuse({
      projectId: "project-1",
      territoryId: "territory-1",
      ingestionRunId: "run-1",
      datasets: [
        dataset("osm", "road", [feature("road-a", "road", line(55), { roadType: "residential" })]),
        dataset("overture", "road", [feature("road-b", "road", line(55.00001), { roadType: "service" })]),
      ],
    });

    expect(result.features).toHaveLength(2);
    expect(result.features.every((item) => item.preferred)).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.features.map((item) => item.id)).toEqual(expect.arrayContaining([
      "canonical:road:osm:road-a",
      "canonical:road:overture:road-b",
    ]));
  });

  it("preserves domains that do not yet have legacy fusion rules", async () => {
    const service = new CanonicalFusionService();
    const result = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1",
      datasets: [dataset("city-geojson", "parcel", [feature("parcel-1", "parcel", buildingGeometry, { cadastralId: "77:01:1" })])],
    });

    expect(result.features).toEqual([expect.objectContaining({ domain: "parcel", preferred: true })]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "FUSION_DOMAIN_UNSUPPORTED", domain: "parcel" })]);
  });

  it("keeps stable ids, increments only changed feature versions and never mutates the previous snapshot", async () => {
    let clock = 0;
    const service = new CanonicalFusionService(undefined, () => `2026-07-20T12:00:0${clock++}.000Z`);
    const first = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1",
      datasets: [dataset("osm", "building", [feature("building-1", "building", buildingGeometry, { height: 15 })])],
    });
    const previous = snapshot(first.features);
    const previousBeforeRefresh = structuredClone(previous);
    const unchanged = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-2",
      datasets: [dataset("osm", "building", [feature("building-1", "building", buildingGeometry, { height: 15 })])],
      previousSnapshot: previous,
    });
    const changed = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-3",
      datasets: [dataset("osm", "building", [feature("building-1", "building", buildingGeometry, { height: 21 })])],
      previousSnapshot: previous,
    });

    expect(unchanged.features[0]?.id).toBe(first.features[0]?.id);
    expect(unchanged.features[0]?.version).toBe(1);
    expect(changed.features[0]?.id).toBe(first.features[0]?.id);
    expect(changed.features[0]?.version).toBe(2);
    expect(previous).toEqual(previousBeforeRefresh);
  });

  it("reuses a previous canonical id for one unambiguous exact-geometry match", async () => {
    const service = new CanonicalFusionService();
    const first = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1",
      datasets: [dataset("osm", "building", [feature("old-source-id", "building", buildingGeometry, { height: 15 })])],
    });
    const refreshed = await service.fuse({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-2",
      datasets: [dataset("osm", "building", [feature("new-source-id", "building", buildingGeometry, { height: 15 })])],
      previousSnapshot: snapshot(first.features),
    });

    expect(refreshed.features[0]?.id).toBe(first.features[0]?.id);
    expect(refreshed.features[0]?.version).toBe(1);
  });
});

describe("CanonicalSnapshotBuilder", () => {
  it("saves an immutable versioned snapshot and links the ingestion run", async () => {
    const canonical = new FakeCanonicalRepository();
    const runs = new FakeIngestionRunRepository(run());
    const builder = new CanonicalSnapshotBuilder(canonical, runs, () => timestamp, () => "snapshot-id");
    const features = [canonicalFeature()];
    const result = await builder.buildAndSave({
      projectId: "project-1",
      territoryId: "territory-1",
      ingestionRunId: "run-1",
      features,
    });

    expect(result.version).toBe(1);
    expect(result.id).toContain("snapshot-id");
    expect(canonical.snapshots).toHaveLength(1);
    expect(runs.value.canonicalSnapshotId).toBe(result.id);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.features[0])).toBe(true);
    expect(features[0]).not.toBe(result.features[0]);
  });

  it("increments snapshot version from the repository latest snapshot", async () => {
    const canonical = new FakeCanonicalRepository([snapshot([canonicalFeature()])]);
    const runs = new FakeIngestionRunRepository(run());
    const builder = new CanonicalSnapshotBuilder(canonical, runs, () => timestamp, () => "next");
    const result = await builder.buildAndSave({
      projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", features: [canonicalFeature()],
    });

    expect(result.version).toBe(2);
  });
});

function dataset(sourceId: string, domain: CanonicalDomain, features: NormalizedSourceFeature[]): NormalizedSourceDataset {
  return { sourceId, domain, rawRecordIds: [`raw-${sourceId}`], features, issues: [], startedAt: timestamp, finishedAt: timestamp };
}

function feature(
  sourceFeatureId: string,
  domain: CanonicalDomain,
  geometry: Geometry,
  attributes: Record<string, unknown>
): NormalizedSourceFeature {
  const sourceId = sourceFeatureId.startsWith("ms-") ? "microsoft-buildings"
    : sourceFeatureId === "road-b" ? "overture"
      : sourceFeatureId.startsWith("parcel-") ? "city-geojson" : "osm";
  return {
    sourceFeatureId,
    domain,
    geometry,
    attributes: { tags: {}, ...attributes },
    provenance: {
      sourceId,
      sourceType: sourceId,
      sourceFeatureId,
      acquiredAt: timestamp,
      processedAt: timestamp,
      acquisitionMethod: "api",
      rawRecordId: `raw-${sourceId}`,
      transformationSteps: ["normalized"],
    },
    geometryConfidence: 0.9,
    attributeConfidence: 0.8,
    missingFields: [],
    validationWarnings: [],
  };
}

function line(latitude: number): Geometry {
  return { type: "LineString", coordinates: [[37, latitude], [38, latitude]] };
}

function snapshot(features: CanonicalFeature[]): CanonicalSnapshot {
  return { id: "snapshot-1", projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-0", createdAt: timestamp, version: 1, features: structuredClone(features) };
}

function canonicalFeature(): CanonicalFeature {
  return {
    id: "canonical:building:osm:building-1", domain: "building", geometry: buildingGeometry,
    attributes: { height: 15 }, projectId: "project-1", territoryId: "territory-1",
    provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: timestamp, processedAt: timestamp, acquisitionMethod: "api", transformationSteps: [] }],
    geometryConfidence: 0.9, attributeConfidence: 0.8, overallConfidence: 0.85,
    missingFields: [], validationWarnings: [], preferred: true, version: 1, createdAt: timestamp, updatedAt: timestamp,
  };
}

function run(): IngestionRun {
  return { id: "run-1", projectId: "project-1", territoryId: "territory-1", requestedDomains: ["building"], sourceIds: ["osm"], status: "completed", startedAt: timestamp, finishedAt: timestamp, rawRecordIds: ["raw-osm"], errors: [], warnings: [] };
}

class FakeCanonicalRepository implements CanonicalRepository {
  constructor(readonly snapshots: CanonicalSnapshot[] = []) {}
  async saveSnapshot(value: CanonicalSnapshot) { this.snapshots.push(structuredClone(value)); }
  async getSnapshot(id: string) { return this.snapshots.find((item) => item.id === id) ?? null; }
  async getLatestSnapshot(input: { projectId: string; territoryId: string }) { return this.snapshots.filter((item) => item.projectId === input.projectId && item.territoryId === input.territoryId).at(-1) ?? null; }
  async query(_query: CanonicalQuery): Promise<CanonicalQueryResult> { return { snapshotId: "", features: [] }; }
  async deleteByProject(projectId: string) { this.snapshots.splice(0, this.snapshots.length, ...this.snapshots.filter((item) => item.projectId !== projectId)); }
}

class FakeIngestionRunRepository implements IngestionRunRepository {
  constructor(public value: IngestionRun) {}
  async create(value: IngestionRun) { this.value = structuredClone(value); }
  async update(value: IngestionRun) { this.value = structuredClone(value); }
  async get(id: string) { return this.value.id === id ? structuredClone(this.value) : null; }
  async getLatest() { return structuredClone(this.value); }
  async listByProject(projectId: string) { return this.value.projectId === projectId ? [structuredClone(this.value)] : []; }
}
