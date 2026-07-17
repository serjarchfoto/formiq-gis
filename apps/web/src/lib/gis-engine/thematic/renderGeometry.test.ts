import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import { describe, expect, it } from "vitest";
import { prepareThematicGeoJsonForRendering } from "./renderGeometry";

describe("prepareThematicGeoJsonForRendering", () => {
  it("closes polygon rings and removes adjacent duplicate coordinates without shifting the footprint", () => {
    const source = collection({
      type: "Polygon",
      coordinates: [
        [
          [37.61, 55.75],
          [37.62, 55.75],
          [37.62, 55.75],
          [37.62, 55.76],
          [37.61, 55.76],
        ],
      ],
    });

    const result = prepareThematicGeoJsonForRendering(source, "source-1");

    expect(result.features[0].geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [37.61, 55.75],
          [37.62, 55.75],
          [37.62, 55.76],
          [37.61, 55.76],
          [37.61, 55.75],
        ],
      ],
    });
    expect(result.features[0].properties?.sourceHash).toBe("source-1");
  });

  it("drops malformed rings instead of sending torn polygons to MapLibre", () => {
    const source = collection({
      type: "Polygon",
      coordinates: [[[37.61, 55.75], [Number.NaN, 55.76], [37.61, 55.75]]],
    });

    expect(prepareThematicGeoJsonForRendering(source, "source-2").features).toEqual([]);
  });

  it("removes sub-pixel Microsoft edge noise while preserving footprint extents", () => {
    const source = collection({
      type: "Polygon",
      coordinates: [[
        [37.61, 55.75],
        [37.615, 55.750006],
        [37.62, 55.75],
        [37.62, 55.76],
        [37.61, 55.76],
        [37.61, 55.75],
      ]],
    }, { geometrySource: "microsoft-buildings" });

    const result = prepareThematicGeoJsonForRendering(source, "source-3");
    const geometry = result.features[0].geometry;

    expect(geometry.type).toBe("Polygon");
    if (geometry.type !== "Polygon") return;
    expect(geometry.coordinates[0]).toEqual([
      [37.61, 55.75],
      [37.62, 55.75],
      [37.62, 55.76],
      [37.61, 55.76],
      [37.61, 55.75],
    ]);
  });
});

function collection(
  geometry: Geometry,
  properties: GeoJsonProperties = { renderColor: "#229ED9" }
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "building-1",
        properties,
        geometry,
      },
    ],
  };
}
