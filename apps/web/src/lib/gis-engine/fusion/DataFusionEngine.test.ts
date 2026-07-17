import { describe, expect, it } from "vitest";
import { DataFusionEngine } from "./DataFusionEngine";
import type { SourceAdapterResult } from "./types";

describe("DataFusionEngine.fuseSourceResults", () => {
  it("builds the canonical collections from pre-normalized chunk features", () => {
    const result: SourceAdapterResult = {
      source: "osm",
      version: "chunked-test",
      features: [
        {
          kind: "building",
          source: "osm",
          sourceFeatureId: "building-1",
          geometry: {
            type: "Polygon",
            coordinates: [[[37.6, 55.7], [37.61, 55.7], [37.61, 55.71], [37.6, 55.71], [37.6, 55.7]]],
          },
          tags: {},
          levels: 3,
        },
        {
          kind: "road",
          source: "osm",
          sourceFeatureId: "road-1",
          geometry: { type: "LineString", coordinates: [[37.6, 55.7], [37.61, 55.71]] },
          tags: {},
        },
      ],
    };

    const fused = new DataFusionEngine().fuseSourceResults(
      { west: 37.59, south: 55.69, east: 37.62, north: 55.72 },
      [result]
    );

    expect(fused.collections.buildings).toHaveLength(1);
    expect(fused.collections.roads).toHaveLength(1);
    expect(fused.statistics.inputFeatureCount).toBe(2);
    expect(fused.statistics.fusedFeatureCount).toBe(2);
  });
});
