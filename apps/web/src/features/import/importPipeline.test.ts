import { describe, expect, it } from "vitest";
import { getImportStageCount } from "./importPipeline";

describe("ImportPipeline monitor", () => {
  it("counts user-facing stages instead of individual provider logs", () => {
    expect(getImportStageCount(["osm", "microsoft-buildings", "wikidata", "copernicus-dem"])).toBe(10);
  });

  it("keeps a compact pipeline for OSM-only imports", () => {
    expect(getImportStageCount(["osm"])).toBe(9);
  });
});
