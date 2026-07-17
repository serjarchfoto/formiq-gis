import { describe, expect, it } from "vitest";
import {
  getBoundingBoxAreaSquareKilometers,
  getImportStageCount,
  ImportPipeline,
} from "./importPipeline";

describe("ImportPipeline monitor", () => {
  it("counts user-facing stages instead of individual provider logs", () => {
    expect(getImportStageCount(["osm", "microsoft-buildings", "wikidata", "copernicus-dem"])).toBe(10);
  });

  it("keeps a compact pipeline for OSM-only imports", () => {
    expect(getImportStageCount(["osm"])).toBe(9);
  });

  it("does not include the heavy terrain stage in the default import", () => {
    expect(getImportStageCount([])).toBe(9);
  });

  it("rejects a very large territory before any source request starts", async () => {
    const bounds = { west: 38.65, south: 55.02, east: 38.9, north: 55.22 };

    expect(getBoundingBoxAreaSquareKilometers(bounds)).toBeGreaterThan(50);
    await expect(new ImportPipeline().run(bounds, { sources: ["osm"] })).rejects.toThrow(
      "Территория слишком большая"
    );
  });
});
