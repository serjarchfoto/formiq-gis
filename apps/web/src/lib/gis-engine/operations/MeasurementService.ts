import type { Geometry, Position } from "geojson";
import {
  bearingDegrees,
  calculateLineStringLength,
  calculatePolygonAreaMeters,
  distanceMeters,
  getFlatCoordinates,
  toGeometry,
} from "./geometryUtils";
import type { GeometryInput, GISOperationResult } from "./types";

export class MeasurementService {
  distance(start: Position, end: Position): GISOperationResult<number> {
    return {
      value: distanceMeters(start, end),
      metadata: { operation: "distance", accuracy: "exact" },
    };
  }

  bearing(start: Position, end: Position): GISOperationResult<number> {
    return {
      value: bearingDegrees(start, end),
      metadata: { operation: "bearing", accuracy: "exact" },
    };
  }

  area(input: GeometryInput): GISOperationResult<number> {
    const geometry = toGeometry(input);

    return {
      value: this.calculateArea(geometry),
      metadata: { operation: "area", accuracy: "exact" },
    };
  }

  length(input: GeometryInput): GISOperationResult<number> {
    const geometry = toGeometry(input);

    return {
      value: this.calculateLength(geometry),
      metadata: { operation: "length", accuracy: "exact" },
    };
  }

  private calculateArea(geometry: Geometry): number {
    if (geometry.type === "Polygon") return calculatePolygonAreaMeters(geometry);
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.reduce(
        (total, polygonCoordinates) =>
          total + calculatePolygonAreaMeters({ type: "Polygon", coordinates: polygonCoordinates }),
        0
      );
    }

    return 0;
  }

  private calculateLength(geometry: Geometry): number {
    if (geometry.type === "LineString") return calculateLineStringLength(geometry);
    if (geometry.type === "MultiLineString") {
      return geometry.coordinates.reduce(
        (total, coordinates) => total + calculateLineStringLength({ type: "LineString", coordinates }),
        0
      );
    }
    if (geometry.type === "Polygon") {
      return geometry.coordinates.reduce(
        (total, ring) => total + calculateLineStringLength({ type: "LineString", coordinates: ring }),
        0
      );
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flat().reduce(
        (total, ring) => total + calculateLineStringLength({ type: "LineString", coordinates: ring }),
        0
      );
    }

    return getFlatCoordinates(geometry).length > 1
      ? calculateLineStringLength({ type: "LineString", coordinates: getFlatCoordinates(geometry) })
      : 0;
  }
}
