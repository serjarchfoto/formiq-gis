import type { Position } from "geojson";
import { createPolygonFeature, getFlatCoordinates, pointKey, toGeometry } from "./geometryUtils";
import type { GeometryInput, GISFeatureCollection, GISOperationResult, GISPolygonFeature } from "./types";

export class ConvexHullService {
  convexHull(input: GeometryInput | GISFeatureCollection): GISOperationResult<GISPolygonFeature | null> {
    const points = uniquePoints(input.type === "FeatureCollection"
      ? input.features.flatMap((feature) => getFlatCoordinates(feature.geometry))
      : getFlatCoordinates(toGeometry(input)));

    if (points.length < 3) {
      return {
        value: null,
        metadata: { operation: "convex-hull", accuracy: "exact", note: "At least three unique points are required." },
      };
    }

    const hull = monotonicChain(points);

    return {
      value: createPolygonFeature({ type: "Polygon", coordinates: [[...hull, hull[0]]] }),
      metadata: { operation: "convex-hull", accuracy: "exact" },
    };
  }
}

function uniquePoints(points: Position[]): Position[] {
  const seen = new Set<string>();

  return points.filter((point) => {
    const key = pointKey(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function monotonicChain(points: Position[]): Position[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Position[] = [];
  const upper: Position[] = [];

  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  });

  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  });

  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

function cross(origin: Position, a: Position, b: Position): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}
