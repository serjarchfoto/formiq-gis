import type { Geometry, LineString, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";
import { distanceMeters } from "./geometryUtils";
import type { GISFeature, GISOperationResult, SimplifyOptions } from "./types";

export class SimplifyService {
  simplify<TGeometry extends Geometry>(
    feature: GISFeature<TGeometry>,
    options: SimplifyOptions
  ): GISOperationResult<GISFeature<TGeometry>> {
    return {
      value: {
        ...feature,
        geometry: simplifyGeometry(feature.geometry, options.toleranceMeters) as TGeometry,
      },
      metadata: { operation: "simplify", accuracy: "approximate" },
    };
  }
}

function simplifyGeometry(geometry: Geometry, toleranceMeters: number): Geometry {
  if (geometry.type === "LineString") return simplifyLineString(geometry, toleranceMeters);
  if (geometry.type === "Polygon") return simplifyPolygon(geometry, toleranceMeters);
  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((coordinates) => simplifyCoordinates(coordinates, toleranceMeters)),
    } satisfies MultiLineString;
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ensureClosedRing(simplifyCoordinates(ring, toleranceMeters)))
      ),
    } satisfies MultiPolygon;
  }

  return geometry;
}

function simplifyLineString(line: LineString, toleranceMeters: number): LineString {
  return {
    ...line,
    coordinates: simplifyCoordinates(line.coordinates, toleranceMeters),
  };
}

function simplifyPolygon(polygon: Polygon, toleranceMeters: number): Polygon {
  return {
    ...polygon,
    coordinates: polygon.coordinates.map((ring) => ensureClosedRing(simplifyCoordinates(ring, toleranceMeters))),
  };
}

function simplifyCoordinates(coordinates: Position[], toleranceMeters: number): Position[] {
  if (coordinates.length <= 2 || toleranceMeters <= 0) return coordinates;

  const keep = new Array<boolean>(coordinates.length).fill(false);
  keep[0] = true;
  keep[coordinates.length - 1] = true;
  simplifySection(coordinates, 0, coordinates.length - 1, toleranceMeters, keep);

  return coordinates.filter((_, index) => keep[index]);
}

function simplifySection(
  coordinates: Position[],
  firstIndex: number,
  lastIndex: number,
  toleranceMeters: number,
  keep: boolean[]
): void {
  let maxDistance = 0;
  let maxIndex = firstIndex;

  for (let index = firstIndex + 1; index < lastIndex; index += 1) {
    const distance = pointToSegmentDistanceMeters(coordinates[index], coordinates[firstIndex], coordinates[lastIndex]);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= toleranceMeters) return;

  keep[maxIndex] = true;
  simplifySection(coordinates, firstIndex, maxIndex, toleranceMeters, keep);
  simplifySection(coordinates, maxIndex, lastIndex, toleranceMeters, keep);
}

function pointToSegmentDistanceMeters(point: Position, start: Position, end: Position): number {
  const segmentLength = distanceMeters(start, end);

  if (segmentLength === 0) return distanceMeters(point, start);

  const startToPoint = distanceMeters(start, point);
  const endToPoint = distanceMeters(end, point);
  const semiPerimeter = (segmentLength + startToPoint + endToPoint) / 2;
  const area = Math.sqrt(
    Math.max(
      semiPerimeter *
        (semiPerimeter - segmentLength) *
        (semiPerimeter - startToPoint) *
        (semiPerimeter - endToPoint),
      0
    )
  );

  return (2 * area) / segmentLength;
}

function ensureClosedRing(ring: Position[]): Position[] {
  if (ring.length < 4) return ring;

  const first = ring[0];
  const last = ring[ring.length - 1];

  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}
