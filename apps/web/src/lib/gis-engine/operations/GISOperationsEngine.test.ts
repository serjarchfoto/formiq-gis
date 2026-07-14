import { describe, expect, it } from "vitest";
import type { Feature, LineString, Point, Polygon } from "geojson";
import { GISOperationsEngine } from "./GISOperationsEngine";

const engine = new GISOperationsEngine();

const square: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]],
  },
};

describe("GISOperationsEngine", () => {
  it("measures distance, bearing, area and length", () => {
    expect(engine.measurement.distance([0, 0], [0, 1]).value).toBeGreaterThan(110_000);
    expect(engine.measurement.bearing([0, 0], [1, 0]).value).toBeCloseTo(90, 3);
    expect(engine.measurement.area(square).value).toBeGreaterThan(12_000_000_000);

    const line: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[0, 0], [0, 1]] },
    };

    expect(engine.measurement.length(line).value).toBeGreaterThan(110_000);
  });

  it("creates centroid, convex hull, nearest point and simplified line", () => {
    expect(engine.centroid.centroid(square).value.geometry.coordinates).toEqual([0.5, 0.5]);

    const points = {
      type: "FeatureCollection" as const,
      features: [
        point([0, 0]),
        point([1, 0]),
        point([0, 1]),
        point([0.25, 0.25]),
      ],
    };

    expect(engine.convexHull.convexHull(points).value?.geometry.coordinates[0]).toHaveLength(4);
    expect(engine.nearestPoint.nearestCoordinate([0, 0], [[5, 5], [0.1, 0.1]]).value?.point.geometry.coordinates).toEqual([
      0.1,
      0.1,
    ]);

    const noisyLine: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[0, 0], [0.0001, 0.0001], [1, 1]] },
    };

    expect(engine.simplify.simplify(noisyLine, { toleranceMeters: 100 }).value.geometry.coordinates).toHaveLength(2);
  });

  it("clips polygons and evaluates boolean operations", () => {
    const clipped = engine.clip.clipToBbox(square, { west: 0.25, south: 0.25, east: 0.75, north: 0.75 }).value;

    expect(clipped?.geometry.type).toBe("Polygon");
    expect(engine.boolean.contains(square, point([0.5, 0.5])).value).toBe(true);
    expect(engine.boolean.intersects(square, point([2, 2])).value).toBe(false);
  });

  it("supports practical overlay operations", () => {
    const pointBuffer = engine.overlay.buffer(point([0, 0]), { radiusMeters: 100, steps: 12 }).value;

    expect(pointBuffer?.geometry.coordinates[0]).toHaveLength(13);

    const rectangleA = rectangle(0, 0, 2, 2);
    const rectangleB = rectangle(1, 1, 3, 3);

    expect(engine.overlay.intersection(rectangleA, rectangleB).value?.geometry.coordinates[0]).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ]);
    expect(engine.overlay.difference(rectangleA, rectangleB).value?.geometry.type).toBe("MultiPolygon");
  });

  it("builds local voronoi cells clipped to bbox", () => {
    const cells = engine.voronoi.voronoi(
      {
        type: "FeatureCollection",
        features: [point([0, 0]), point([1, 0])],
      },
      { bbox: { west: -1, south: -1, east: 2, north: 1 } }
    ).value;

    expect(cells.features).toHaveLength(2);
    expect(cells.features.every((cell) => cell.geometry.type === "Polygon")).toBe(true);
  });
});

function point(coordinates: [number, number]): Feature<Point> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates },
  };
}

function rectangle(west: number, south: number, east: number, north: number): Feature<Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
  };
}
