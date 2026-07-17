import { describe, expect, it } from "vitest";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import { buildAnalysisModel } from "@/features/analysis/model";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import { AnalysisEngine, createDefaultAnalysisRegistry } from "./AnalysisEngine";

describe("AnalysisEngine baseline", () => {
  it("keeps the current calculator registration order", () => {
    expect(createDefaultAnalysisRegistry().getAll().map((calculator) => calculator.key)).toEqual([
      "territory",
      "buildings",
      "buildings",
      "buildings",
      "buildings",
      "buildings",
      "roads",
      "vegetation",
      "water",
      "terrain",
      "accessibility",
    ]);
  });

  it("calculates the current project-derived sections without changing their semantics", () => {
    const result = new AnalysisEngine().analyze(createAnalysisFixtureProject());

    expect(result.buildings.count).toBe(2);
    expect(result.buildings.floorDistribution.low).toBe(1);
    expect(result.buildings.floorDistribution.unknown).toBe(1);
    expect(result.buildings.ageDistribution["post-soviet"]).toBe(1);
    expect(result.buildings.ageDistribution.unknown).toBe(1);
    expect(result.buildings.functionDistribution.residential).toBe(1);
    expect(result.buildings.functionDistribution.unknown).toBe(1);
    expect(result.roads.totalLength).toBe(1_200);
    expect(result.vegetation.area).toBe(600);
    expect(result.water.area).toBe(300);
    expect(result.terrain.status).toBe("ready");
    expect(result.accessibility.status).toBe("ready");
    expect(result.accessibility.coveragePercent).toBe(100);
  });

  it("returns stable empty and no-data sections", () => {
    const result = new AnalysisEngine().analyze(createEmptyFormiqProject());

    expect(result.territory.area).toBe(0);
    expect(result.buildings.count).toBe(0);
    expect(result.buildings.averageLevels).toBeNull();
    expect(result.buildings.estimatedPopulation).toBe(0);
    expect(result.roads.totalLength).toBe(0);
    expect(result.vegetation.area).toBe(0);
    expect(result.water.area).toBe(0);
    expect(result.terrain.status).toBe("not-available");
    expect(result.accessibility.status).toBe("not-available");
  });

  it("exposes the current UI units while keeping heuristic metrics identifiable by id", () => {
    const model = buildAnalysisModel(new AnalysisEngine().analyze(createAnalysisFixtureProject()));

    expect(model.metricsById.density.unit).toBe("чел/га");
    expect(model.metricsById.noise.unit).toBe("дБ");
    expect(model.metricsById.insolation.unit).toBe("ч");
    expect(model.metricsById.transport.unit).toBe("/ 10");
  });
});
