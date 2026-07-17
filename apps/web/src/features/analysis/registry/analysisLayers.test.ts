import { describe, expect, it } from "vitest";
import { AnalysisEngine } from "@/lib/gis-engine/analysis";
import { ThematicMapEngine } from "@/lib/gis-engine/thematic";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import { buildAnalysisModel } from "@/features/analysis/model";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import {
  DEFAULT_ANALYSIS_LAYER_ID,
  createAnalysisLegendViewModel,
  createAnalysisMetricViewModels,
  getAnalysisLayerDefinition,
  getReadyAnalysisLayers,
  getReservedAnalysisLayers,
  getThematicMapTypeForAnalysisLayer,
  normalizeAnalysisLayerId,
} from ".";

const readyIds = [
  "floor-count",
  "building-age",
  "building-function",
  "built-density",
  "roads",
  "greenery",
  "water",
  "poi-transit",
  "terrain",
];

const reservedIds = [
  "population-density",
  "transit-accessibility",
  "elevation-analysis",
  "functional-zoning",
  "sun-shadows",
  "noise",
  "wind",
  "visibility",
  "social-infrastructure",
  "pedestrian-accessibility",
  "suitability",
];

describe("analysisLayers registry", () => {
  it("registers the first migration layers separately from future modes", () => {
    expect(getReadyAnalysisLayers().map((layer) => layer.id)).toEqual([...readyIds, "population-density"]);
    expect(getReservedAnalysisLayers().map((layer) => layer.id)).toEqual(reservedIds.filter((id) => id !== "population-density"));
    expect(getReservedAnalysisLayers().every((layer) => layer.status === "unsupported")).toBe(true);
    expect(getReservedAnalysisLayers().every((layer) => layer.thematicMapType == null)).toBe(true);
  });

  it("maps every ready layer to an existing thematic generator", () => {
    const thematicIds = new Set(new ThematicMapEngine().getAvailableLayers().map((layer) => layer.id));
    expect(getReadyAnalysisLayers().every((layer) => thematicIds.has(layer.thematicMapType ?? ""))).toBe(true);
  });

  it("treats FAR and GSI as metrics of the same built-density visualization", () => {
    expect(normalizeAnalysisLayerId("far")).toBe("built-density");
    expect(normalizeAnalysisLayerId("gsi")).toBe("built-density");
    expect(getThematicMapTypeForAnalysisLayer("far")).toBe("density");
    expect(getThematicMapTypeForAnalysisLayer("gsi")).toBe("density");
    expect(getAnalysisLayerDefinition("built-density").metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining(["far", "gsi"])
    );
  });

  it("does not substitute reserved analysis modes with unrelated maps", () => {
    expect(getThematicMapTypeForAnalysisLayer("population-density")).toBe("population");
    expect(getThematicMapTypeForAnalysisLayer("sun-shadows")).toBe("none");
    expect(getThematicMapTypeForAnalysisLayer("insolation")).toBe("none");
  });

  it("falls back safely for an unknown layer id", () => {
    expect(normalizeAnalysisLayerId("not-registered")).toBe(DEFAULT_ANALYSIS_LAYER_ID);
    expect(getAnalysisLayerDefinition("not-registered").id).toBe(DEFAULT_ANALYSIS_LAYER_ID);
    expect(getThematicMapTypeForAnalysisLayer("not-registered")).toBe("density");
  });

  it("synchronizes the UI legend with thematicMap.legend", () => {
    const project = createAnalysisFixtureProject();
    const analysis = new AnalysisEngine().analyze(project);
    const definition = getAnalysisLayerDefinition("floor-count");
    const map = new ThematicMapEngine().generate(definition.thematicMapType ?? "none", project, analysis);
    const legend = createAnalysisLegendViewModel(definition, map);

    expect(legend.state).toBe("ready");
    expect(legend.categories).toEqual(map?.legend);
  });

  it("returns an explicit no-data legend state for an empty ready layer", () => {
    const project = createEmptyFormiqProject();
    const analysis = new AnalysisEngine().analyze(project);
    const definition = getAnalysisLayerDefinition("terrain");
    const map = new ThematicMapEngine().generate(definition.thematicMapType ?? "none", project, analysis);

    expect(createAnalysisLegendViewModel(definition, map)).toEqual(
      expect.objectContaining({ state: "no-data", categories: [] })
    );
  });

  it("adapts registry metrics with units and data quality outside React", () => {
    const project = createAnalysisFixtureProject();
    const analysis = new AnalysisEngine().analyze(project);
    const model = buildAnalysisModel(analysis);
    const metrics = createAnalysisMetricViewModels(getAnalysisLayerDefinition("built-density"), analysis, model);

    expect(metrics.find((metric) => metric.id === "far")).toEqual(
      expect.objectContaining({ quality: "derived", dataStatus: "derived", source: expect.any(String) })
    );
    expect(metrics.find((metric) => metric.id === "building-count")?.unit).toBe("объектов");
  });

  it("marks metric adapters as no-data without inventing values for an empty layer", () => {
    const analysis = new AnalysisEngine().analyze(createEmptyFormiqProject());
    const metrics = createAnalysisMetricViewModels(
      getAnalysisLayerDefinition("roads"),
      analysis,
      buildAnalysisModel(analysis)
    );

    expect(metrics).not.toHaveLength(0);
    expect(metrics.every((metric) => metric.state === "no-data")).toBe(true);
  });
});
