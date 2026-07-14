import type { FeatureCollection, Point, Position } from "geojson";
import { createPointFeature, distanceMeters } from "./geometryUtils";
import type { GISOperationResult, GISPointFeature, NearestPointResult } from "./types";

export class NearestPointService {
  nearestPoint(
    target: Position | GISPointFeature,
    candidates: FeatureCollection<Point>
  ): GISOperationResult<NearestPointResult | null> {
    const targetCoordinates = Array.isArray(target) ? target : target.geometry.coordinates;
    let nearest: GISPointFeature | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    candidates.features.forEach((candidate) => {
      const distance = distanceMeters(targetCoordinates, candidate.geometry.coordinates);

      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    });

    return {
      value: nearest ? { point: nearest, distanceMeters: nearestDistance } : null,
      metadata: { operation: "nearest-point", accuracy: "exact" },
    };
  }

  nearestCoordinate(target: Position, candidates: Position[]): GISOperationResult<NearestPointResult | null> {
    return this.nearestPoint(target, {
      type: "FeatureCollection",
      features: candidates.map((candidate) => createPointFeature(candidate)),
    });
  }
}
