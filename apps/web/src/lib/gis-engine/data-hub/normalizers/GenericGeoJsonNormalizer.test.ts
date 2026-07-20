import { describe, expect, it } from "vitest";
import type { RawDataRecord } from "../types";
import { GenericGeoJsonNormalizer } from "./GenericGeoJsonNormalizer";

const context = { projectId: "project-1", territoryId: "territory-1", ingestionRunId: "run-1", sourceId: "file", sourceType: "file", domain: "poi" as const, rawRecordId: "raw-1", acquiredAt: "2026-07-20T12:00:00.000Z" };

describe("GenericGeoJsonNormalizer", () => {
  it("normalizes a large feature collection without dropping records", async () => {
    const features = Array.from({ length: 2_000 }, (_, index) => ({ type: "Feature", id: `poi-${index}`, properties: { name: `POI ${index}` }, geometry: { type: "Point", coordinates: [0.1 + index / 100_000, 0.2] } }));
    const result = await new GenericGeoJsonNormalizer().normalize([raw({ type: "FeatureCollection", features }, { inputCrs: "EPSG:4326" })], context);
    expect(result.features).toHaveLength(2_000);
    expect(result.issues).toEqual([]);
  });

  it("reports invalid geometry and never silently repairs it", async () => {
    const payload = { type: "FeatureCollection", features: [{ type: "Feature", id: "invalid", properties: {}, geometry: { type: "Point", coordinates: [Number.NaN, 0] } }] };
    const result = await new GenericGeoJsonNormalizer().normalize([raw(payload, { inputCrs: "EPSG:4326" })], context);
    expect(result.features).toEqual([]);
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("marks unknown CRS and lowers geometry confidence", async () => {
    const payload = { type: "FeatureCollection", features: [{ type: "Feature", id: "poi", properties: {}, geometry: { type: "Point", coordinates: [0.5, 0.5] } }] };
    const result = await new GenericGeoJsonNormalizer().normalize([raw(payload)], context);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "CRS_MISSING" }));
    expect(result.features[0]?.geometryConfidence).toBeLessThan(0.5);
  });
});

function raw(payload: unknown, sourceMetadata: Record<string, unknown> = {}): RawDataRecord {
  return { id: "raw-1", ingestionRunId: "run-1", projectId: "project-1", territoryId: "territory-1", sourceId: "file", domain: "poi", receivedAt: context.acquiredAt, sourceMetadata, payload };
}
