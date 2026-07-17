import type { FeatureCollection, LineString, Point } from "geojson";
import { describe, expect, it } from "vitest";
import { AreaService, clipProjectToArea, validateArea } from "./areaService";
import { createAnalysisFixtureProject } from "@/test/analysisFixture";
import { createTerritorySelection } from "./selectionGeometry";

describe("AreaService", () => {
  const area = createTerritorySelection([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], "rectangle");

  it("validates and exposes one current area", () => {
    expect(validateArea(area).valid).toBe(true);
    AreaService.setArea(area);
    expect(AreaService.contains([5, 5])).toBe(true);
    expect(AreaService.contains([20, 20])).toBe(false);
    AreaService.clear();
  });

  it("clips line and point collections through the same API", () => {
    AreaService.setArea(area);
    const features: FeatureCollection<LineString | Point> = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-2, 5], [5, 5], [12, 5]] } },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [20, 20] } },
      ],
    };
    const clipped = AreaService.clipFeatures(features);
    expect(clipped.features).toHaveLength(1);
    expect(clipped.features[0]?.geometry.type).toBe("LineString");
    AreaService.clear();
  });

  it("keeps canonical entities when they are inside the active area", () => {
    const project = createAnalysisFixtureProject();
    const clipped = clipProjectToArea(project, {
      shape: "rectangle",
      bounds: { west: 37.59, south: 55.69, east: 37.63, north: 55.73 },
      geometry: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[37.59, 55.69], [37.63, 55.69], [37.63, 55.73], [37.59, 55.73], [37.59, 55.69]]] } },
    });
    expect(clipped.buildings.length).toBe(project.buildings.length);
    expect(clipped.roads.length).toBe(project.roads.length);
  });
});
