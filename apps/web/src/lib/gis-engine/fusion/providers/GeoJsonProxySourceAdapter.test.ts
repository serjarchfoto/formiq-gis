import type { Feature, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { normalizeGeneralGeoJsonFeature } from "./GeoJsonProxySourceAdapter";

describe("normalizeGeneralGeoJsonFeature", () => {
  it.each([
    ["building", polygon({ building: "yes" }), "building"],
    ["road", line({ highway: "primary" }), "road"],
    ["vegetation", polygon({ landuse: "forest" }), "vegetation"],
    ["water", polygon({ natural: "water" }), "water"],
    ["boundary", polygon({ boundary: "administrative" }), "boundary"],
    ["poi", point({ category: "museum" }), "poi"],
    ["transit stop", point({ public_transport: "platform" }), "transit-stop"],
  ])("normalizes a local %s feature", (_label, feature, expectedKind) => {
    const result = normalizeGeneralGeoJsonFeature(
      "city-geojson",
      feature,
      0,
      "test"
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe(expectedKind);
  });
});

function point(properties: Record<string, unknown>): Feature<Geometry> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: [37.617, 55.755] },
  };
}

function line(properties: Record<string, unknown>): Feature<Geometry> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: [
        [37.617, 55.755],
        [37.618, 55.756],
      ],
    },
  };
}

function polygon(properties: Record<string, unknown>): Feature<Geometry> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [37.617, 55.755],
          [37.618, 55.755],
          [37.618, 55.756],
          [37.617, 55.755],
        ],
      ],
    },
  };
}
