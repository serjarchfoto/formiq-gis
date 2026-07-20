import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange as FakeIDBKeyRange } from "fake-indexeddb";
import { closeFormiqDatabaseConnection } from "@/lib/storage/indexedDbProjectStorage";
import { DataHubQueryError, DataHubQueryService } from "./DataHubQueryService";
import { IndexedDbCanonicalRepository, IndexedDbQualityRepository } from "./repositories";
import type { CanonicalFeature, CanonicalSnapshot, QualityReport } from "./types";

beforeEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", FakeIDBKeyRange);
});

afterEach(async () => {
  await closeFormiqDatabaseConnection();
  vi.unstubAllGlobals();
});

describe("DataHubQueryService", () => {
  it("returns an empty canonical result when no snapshot exists", async () => {
    const service = createService();
    await expect(service.getLatestSnapshot(scope)).resolves.toBeNull();
    await expect(service.queryCanonical(scope)).resolves.toEqual({ snapshotId: "", features: [] });
    await expect(service.queryAnalysisContext({ ...scope, requirements: [] })).rejects.toMatchObject({
      code: "SNAPSHOT_NOT_FOUND",
    } satisfies Partial<DataHubQueryError>);
  });

  it("rejects analysis context when the snapshot has no matching quality report", async () => {
    const { service, canonical } = createHarness();
    await canonical.saveSnapshot(snapshot([feature("inside", [37.5, 55.5], true, 0.9)]));
    await expect(service.queryAnalysisContext({
      ...scope, requirements: [{ domain: "poi", required: true }],
    })).rejects.toMatchObject({ code: "QUALITY_NOT_FOUND" });
  });

  it("applies bbox, preferredOnly and minimum confidence through the canonical repository", async () => {
    const { service, canonical, quality } = createHarness();
    const current = snapshot([
      feature("inside", [37.5, 55.5], true, 0.9),
      feature("outside", [45, 60], true, 0.9),
      feature("alternate", [37.6, 55.6], false, 0.9),
      feature("low-confidence", [37.7, 55.7], true, 0.3),
    ]);
    await canonical.saveSnapshot(current);
    await quality.save(report(current.id, "complete", 0.8));

    const result = await service.queryCanonical({
      ...scope,
      domains: ["poi"],
      bbox: [37, 55, 38, 56],
      preferredOnly: true,
      minConfidence: 0.5,
    });
    expect(result.features.map((item) => item.id)).toEqual(["inside"]);
    expect(result.quality?.canonicalSnapshotId).toBe(current.id);
    await expect(service.queryLayers({ ...scope, preferredOnly: true })).resolves.toMatchObject({ snapshotId: current.id });
  });

  it("returns ready analysis context for satisfied typed requirements", async () => {
    const { service, canonical, quality } = createHarness();
    const current = snapshot([feature("inside", [37.5, 55.5], true, 0.9)]);
    await canonical.saveSnapshot(current);
    await quality.save(report(current.id, "complete", 0.8));

    const context = await service.queryAnalysisContext({
      ...scope,
      requirements: [{ domain: "poi", required: true, minimumCoverage: 0.6, minimumQuality: 0.5 }],
    });
    expect(context).toMatchObject({ ready: true, degraded: false, snapshotId: current.id });
    expect(context.features.poi).toHaveLength(1);
  });

  it("treats unknown coverage as a missing requirement, not as zero or complete", async () => {
    const { service, canonical, quality } = createHarness();
    const current = snapshot([feature("inside", [37.5, 55.5], true, 0.9)]);
    await canonical.saveSnapshot(current);
    await quality.save(report(current.id, "partial", null));
    const requirement = { domain: "poi" as const, required: true, minimumCoverage: 0.5 };

    const context = await service.queryAnalysisContext({ ...scope, requirements: [requirement] });
    expect(context.ready).toBe(false);
    expect(context.degraded).toBe(true);
    expect(context.missingRequirements).toEqual([requirement]);
    expect(context.warnings).toContain("poi: required coverage is unknown.");
  });
});

const scope = { projectId: "project-1", territoryId: "territory-1" };

function createService() { return createHarness().service; }
function createHarness() {
  const canonical = new IndexedDbCanonicalRepository();
  const quality = new IndexedDbQualityRepository();
  return { canonical, quality, service: new DataHubQueryService(canonical, quality) };
}

function snapshot(features: CanonicalFeature[]): CanonicalSnapshot {
  return { id: "snapshot-1", ...scope, ingestionRunId: "run-1", createdAt: "2026-07-20T12:00:00.000Z", version: 1, features };
}

function feature(id: string, coordinates: [number, number], preferred: boolean, confidence: number): CanonicalFeature {
  return {
    id, domain: "poi", geometry: { type: "Point", coordinates }, attributes: { category: "cafe", name: id }, ...scope,
    provenance: [{ sourceId: "osm", sourceType: "osm", acquiredAt: "2026-07-20T10:00:00.000Z", processedAt: "2026-07-20T10:01:00.000Z", acquisitionMethod: "api", transformationSteps: [] }],
    geometryConfidence: confidence, attributeConfidence: confidence, overallConfidence: confidence,
    missingFields: [], validationWarnings: [], preferred, version: 1,
    createdAt: "2026-07-20T10:01:00.000Z", updatedAt: "2026-07-20T10:01:00.000Z",
  };
}

function report(snapshotId: string, status: QualityReport["overallStatus"], coverage: number | null): QualityReport {
  const measurement = coverage === null ? "unknown" as const : "measured" as const;
  return {
    id: `quality-${snapshotId}`, ...scope, canonicalSnapshotId: snapshotId, createdAt: "2026-07-20T12:01:00.000Z",
    overallStatus: status, overallScore: coverage === null ? null : 0.8,
    domains: { poi: {
      domain: "poi", status, featureCount: 1, coverageScore: coverage, geometryScore: 1, attributeScore: 1,
      freshnessScore: 1, sourceReliabilityScore: 0.8, overallScore: coverage === null ? null : 0.8,
      measurement, measurements: { coverage: measurement, geometry: "measured", attributes: "measured", freshness: "measured", sourceReliability: "estimated", overall: measurement },
      missingRequirements: [], warnings: [], sourceIds: ["osm"],
    } },
  };
}
