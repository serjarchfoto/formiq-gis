import type { Geometry, LineString, Polygon, Position } from "geojson";
import type { BoundingBox } from "@/types/gis";
import {
  bboxToPolygon,
  getGeometryBbox,
  pointInPolygon,
} from "./geometryUtils";
import type { GISFeature, GISOperationResult } from "./types";

export class ClipService {
  clipToBbox<TGeometry extends Geometry>(
    feature: GISFeature<TGeometry>,
    bbox: BoundingBox
  ): GISOperationResult<GISFeature | null> {
    const clipped = clipGeometryToBbox(feature.geometry, bbox);

    return {
      value: clipped ? { ...feature, geometry: clipped } : null,
      metadata: { operation: "clip-bbox", accuracy: "exact" },
    };
  }

  clipToPolygon<TGeometry extends Geometry>(
    feature: GISFeature<TGeometry>,
    polygon: Polygon
  ): GISOperationResult<GISFeature | null> {
    const clipped =
      feature.geometry.type === "Polygon"
        ? clipPolygonByRing(feature.geometry, polygon.coordinates[0] ?? [])
        : clipGeometryByPolygon(feature.geometry, polygon);

    return {
      value: clipped ? { ...feature, geometry: clipped } : null,
      metadata: {
        operation: "clip-polygon",
        accuracy: feature.geometry.type === "Polygon" ? "limited" : "exact",
        note: feature.geometry.type === "Polygon" ? "Exact for convex clipping polygons." : undefined,
      },
    };
  }
}

function clipGeometryToBbox(geometry: Geometry, bbox: BoundingBox): Geometry | null {
  const clipPolygon = bboxToPolygon(bbox);

  if (geometry.type === "Point") return pointInPolygon(geometry.coordinates, clipPolygon) ? geometry : null;
  if (geometry.type === "LineString") return clipLineToBbox(geometry, bbox);
  if (geometry.type === "Polygon") return clipPolygonByRing(geometry, clipPolygon.coordinates[0]);

  const geometryBbox = getGeometryBbox(geometry);
  if (!geometryBbox) return null;

  return geometry;
}

function clipGeometryByPolygon(geometry: Geometry, polygon: Polygon): Geometry | null {
  if (geometry.type === "Point") return pointInPolygon(geometry.coordinates, polygon) ? geometry : null;
  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates.filter((coordinate) => pointInPolygon(coordinate, polygon));
    return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
  }

  return pointInPolygon(getGeometryReferencePoint(geometry), polygon) ? geometry : null;
}

function clipLineToBbox(line: LineString, bbox: BoundingBox): LineString | null {
  const segments = line.coordinates
    .map((coordinate, index, coordinates) => (index === 0 ? null : clipSegmentToBbox(coordinates[index - 1], coordinate, bbox)))
    .filter((segment): segment is [Position, Position] => segment !== null);

  if (!segments.length) return null;

  const coordinates = segments.flatMap((segment, index) => (index === 0 ? segment : [segment[1]]));

  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function clipSegmentToBbox(start: Position, end: Position, bbox: BoundingBox): [Position, Position] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  const tests: Array<[number, number]> = [
    [-dx, start[0] - bbox.west],
    [dx, bbox.east - start[0]],
    [-dy, start[1] - bbox.south],
    [dy, bbox.north - start[1]],
  ];

  for (const [p, q] of tests) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;

    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    if (p > 0) t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }

  return [
    [start[0] + t0 * dx, start[1] + t0 * dy],
    [start[0] + t1 * dx, start[1] + t1 * dy],
  ];
}

function clipPolygonByRing(polygon: Polygon, clippingRing: Position[]): Polygon | null {
  let output = polygon.coordinates[0] ?? [];

  for (let index = 0; index < clippingRing.length - 1; index += 1) {
    output = clipRingByEdge(output, clippingRing[index], clippingRing[index + 1]);
    if (!output.length) return null;
  }

  if (output.length < 3) return null;

  const first = output[0];
  const last = output[output.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? output : [...output, first];

  return { type: "Polygon", coordinates: [closed] };
}

function clipRingByEdge(ring: Position[], edgeStart: Position, edgeEnd: Position): Position[] {
  const output: Position[] = [];

  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = isLeftOfEdge(current, edgeStart, edgeEnd);
    const previousInside = isLeftOfEdge(previous, edgeStart, edgeEnd);

    if (currentInside && !previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
    if (currentInside) output.push(current);
    if (!currentInside && previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
  });

  return output;
}

function isLeftOfEdge(point: Position, edgeStart: Position, edgeEnd: Position): boolean {
  return (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1]) - (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0]) >= 0;
}

function lineIntersection(a: Position, b: Position, c: Position, d: Position): Position {
  const a1 = b[1] - a[1];
  const b1 = a[0] - b[0];
  const c1 = a1 * a[0] + b1 * a[1];
  const a2 = d[1] - c[1];
  const b2 = c[0] - d[0];
  const c2 = a2 * c[0] + b2 * c[1];
  const determinant = a1 * b2 - a2 * b1;

  if (Math.abs(determinant) < 1e-12) return b;

  return [(b2 * c1 - b1 * c2) / determinant, (a1 * c2 - a2 * c1) / determinant];
}

function getGeometryReferencePoint(geometry: Geometry): Position {
  if (geometry.type === "Point") return geometry.coordinates;
  if (geometry.type === "LineString") return geometry.coordinates[0] ?? [0, 0];
  if (geometry.type === "Polygon") return geometry.coordinates[0]?.[0] ?? [0, 0];
  return getGeometryBbox(geometry)
    ? [getGeometryBbox(geometry)!.west, getGeometryBbox(geometry)!.south]
    : [0, 0];
}
