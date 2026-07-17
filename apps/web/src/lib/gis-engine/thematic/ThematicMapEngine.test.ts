import { describe, expect, it } from "vitest";
import { AnalysisEngine } from "@/lib/gis-engine/analysis";
import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import { ThematicMapEngine } from "./ThematicMapEngine";

const registeredTypes = [
  "floors",
  "age",
  "function",
  "roads",
  "density",
  "vegetation",
  "water",
  "accessibility",
  "terrain",
  "population",
] as const;

const expectedFeatureCounts: Record<(typeof registeredTypes)[number], number> = {
  floors: 2,
  age: 2,
  function: 2,
  roads: 1,
  density: 2,
  vegetation: 1,
  water: 1,
  accessibility: 2,
  terrain: 1,
  population: 2,
};

describe("ThematicMapEngine baseline", () => {
  it("keeps the current generator registration order", () => {
    expect(new ThematicMapEngine().getAvailableLayers().map((layer) => layer.id)).toEqual(registeredTypes);
  });

  it.each(registeredTypes)("builds %s with GeoJSON, legend, palette and style", (type) => {
    const project = createAnalysisFixtureProject();
    const analysis = new AnalysisEngine().analyze(project);
    const map = new ThematicMapEngine().generate(type, project, analysis);

    expect(map).not.toBeNull();
    expect(map?.type).toBe(type);
    expect(map?.geojson.type).toBe("FeatureCollection");
    expect(map?.geojson.features).toHaveLength(expectedFeatureCounts[type]);
    expect(map?.palette.id).toBeTruthy();
    expect(map?.palette.colors).toBeTypeOf("object");
    expect(map?.legend).toBeInstanceOf(Array);
    expect(map?.style.fillColorProperty).toBe("renderColor");
    for (const item of map?.legend ?? []) {
      expect(item).toEqual(
        expect.objectContaining({ key: expect.any(String), label: expect.any(String), color: expect.any(String) })
      );
    }
  });

  it("keeps unknown categories renderable instead of throwing", () => {
    const project = createAnalysisFixtureProject();
    const analysis = new AnalysisEngine().analyze(project);
    const floors = new ThematicMapEngine().generate("floors", project, analysis);

    expect(floors?.legend.find((item) => item.key === "unknown")?.count).toBe(1);
    expect(floors?.geojson.features.find((feature) => feature.id === "building-unknown")?.properties).toEqual(
      expect.objectContaining({ category: "unknown", renderColor: expect.any(String) })
    );
  });

  it.each(registeredTypes)("builds an empty %s map without inventing features", (type) => {
    const project = createEmptyFormiqProject();
    const analysis = new AnalysisEngine().analyze(project);
    const map = new ThematicMapEngine().generate(type, project, analysis);

    expect(map?.geojson.features).toEqual([]);
    expect(map?.legend.every((item) => item.count === 0)).toBe(true);
  });

  it("returns null for none and unknown thematic types", () => {
    const project = createEmptyFormiqProject();
    const analysis = new AnalysisEngine().analyze(project);
    const engine = new ThematicMapEngine();

    expect(engine.generate("none", project, analysis)).toBeNull();
    expect(engine.generate("unknown-layer", project, analysis)).toBeNull();
  });
});
