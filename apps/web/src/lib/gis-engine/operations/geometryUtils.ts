import type { Feature, Geometry, LineString, Point, Polygon, Position } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type { GeometryInput, Segment } from "./types";

export const EARTH_RADIUS_M = 6_371_000;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

export function toGeometry(input: GeometryInput): Geometry {
  return input.type === "Feature" ? input.geometry : input;
}

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function distanceMeters(start: Position, end: Position): number {
  const startLatitude = toRadians(start[1]);
  const endLatitude = toRadians(end[1]);
  const deltaLatitude = toRadians(end[1] - start[1]);
  const deltaLongitude = toRadians(end[0] - start[0]);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  const groundDistance = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const elevation = getElevation(end) - getElevation(start);

  return elevation ? Math.hypot(groundDistance, elevation) : groundDistance;
}

export function bearingDegrees(start: Position, end: Position): number {
  const startLatitude = toRadians(start[1]);
  const endLatitude = toRadians(end[1]);
  const deltaLongitude = toRadians(end[0] - start[0]);
  const y = Math.sin(deltaLongitude) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(deltaLongitude);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

export function destinationPoint(start: Position, distance: number, bearing: number): Position {
  const angularDistance = distance / EARTH_RADIUS_M;
  const startLatitude = toRadians(start[1]);
  const startLongitude = toRadians(start[0]);
  const bearingRadians = toRadians(bearing);
  const latitude = Math.asin(
    Math.sin(startLatitude) * Math.cos(angularDistance) +
      Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );
  const longitude =
    startLongitude +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(startLatitude),
      Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(latitude)
    );

  return [normalizeLongitude(toDegrees(longitude)), toDegrees(latitude)];
}

export function calculateLineStringLength(line: LineString): number {
  return line.coordinates.reduce((total, coordinate, index, coordinates) => {
    if (index === 0) return total;
    return total + distanceMeters(coordinates[index - 1], coordinate);
  }, 0);
}

export function calculatePolygonAreaMeters(polygon: Polygon): number {
  const [outerRing, ...holes] = polygon.coordinates;
  const outerArea = Math.abs(calculateRingAreaMeters(outerRing ?? []));
  const holesArea = holes.reduce((total, ring) => total + Math.abs(calculateRingAreaMeters(ring)), 0);

  return Math.max(outerArea - holesArea, 0);
}

export function calculateRingAreaMeters(ring: Position[]): number {
  if (ring.length < 4) return 0;

  const projected = ring.map(projectToWebMercator);

  return (
    projected.reduce((area, point, index) => {
      const nextPoint = projected[(index + 1) % projected.length];
      return area + point.x * nextPoint.y - nextPoint.x * point.y;
    }, 0) / 2
  );
}

export function getGeometryBbox(geometry: Geometry): BoundingBox | null {
  const coordinates = getFlatCoordinates(geometry);

  if (!coordinates.length) return null;

  return coordinates.reduce<BoundingBox>(
    (bbox, coordinate) => ({
      west: Math.min(bbox.west, coordinate[0]),
      south: Math.min(bbox.south, coordinate[1]),
      east: Math.max(bbox.east, coordinate[0]),
      north: Math.max(bbox.north, coordinate[1]),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  );
}

export function bboxToPolygon(bbox: BoundingBox): Polygon {
  return {
    type: "Polygon",
    coordinates: [[
      [bbox.west, bbox.south],
      [bbox.east, bbox.south],
      [bbox.east, bbox.north],
      [bbox.west, bbox.north],
      [bbox.west, bbox.south],
    ]],
  };
}

export function polygonToBboxIfRectangle(polygon: Polygon): BoundingBox | null {
  const ring = normalizeClosedRing(polygon.coordinates[0] ?? []);

  if (polygon.coordinates.length > 1 || ring.length !== 5) return null;

  const bbox = getGeometryBbox(polygon);

  if (!bbox) return null;

  const expected = bboxToPolygon(bbox).coordinates[0];
  const expectedKeys = new Set(expected.map(pointKey));

  return ring.every((point) => expectedKeys.has(pointKey(point))) ? bbox : null;
}

export function bboxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function bboxIntersection(a: BoundingBox, b: BoundingBox): BoundingBox | null {
  if (!bboxesIntersect(a, b)) return null;

  return {
    west: Math.max(a.west, b.west),
    south: Math.max(a.south, b.south),
    east: Math.min(a.east, b.east),
    north: Math.min(a.north, b.north),
  };
}

export function bboxContains(a: BoundingBox, b: BoundingBox): boolean {
  return a.west <= b.west && a.south <= b.south && a.east >= b.east && a.north >= b.north;
}

export function expandBboxMeters(bbox: BoundingBox, radiusMeters: number): BoundingBox {
  const meanLatitude = (bbox.south + bbox.north) / 2;
  const latDelta = metersToLatitudeDegrees(radiusMeters);
  const lngDelta = metersToLongitudeDegrees(radiusMeters, meanLatitude);

  return {
    west: bbox.west - lngDelta,
    south: bbox.south - latDelta,
    east: bbox.east + lngDelta,
    north: bbox.north + latDelta,
  };
}

export function metersToLatitudeDegrees(meters: number): number {
  return toDegrees(meters / EARTH_RADIUS_M);
}

export function metersToLongitudeDegrees(meters: number, latitude: number): number {
  const scale = Math.max(Math.cos(toRadians(latitude)), 0.000001);
  return toDegrees(meters / (EARTH_RADIUS_M * scale));
}

export function getFlatCoordinates(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

export function getSegments(geometry: Geometry): Segment[] {
  if (geometry.type === "LineString") return getLineSegments(geometry.coordinates);
  if (geometry.type === "Polygon") return geometry.coordinates.flatMap(getLineSegments);
  return [];
}

export function getLineSegments(coordinates: Position[]): Segment[] {
  const segments: Segment[] = [];

  for (let index = 1; index < coordinates.length; index += 1) {
    segments.push([coordinates[index - 1], coordinates[index]]);
  }

  return segments;
}

export function normalizeClosedRing(ring: Position[]): Position[] {
  if (!ring.length) return ring;

  const first = ring[0];
  const last = ring[ring.length - 1];

  return pointKey(first) === pointKey(last) ? ring : [...ring, first];
}

export function pointKey(point: Position): string {
  return `${point[0].toFixed(10)}:${point[1].toFixed(10)}`;
}

export function cloneFeature<TGeometry extends Geometry>(feature: Feature<TGeometry>): Feature<TGeometry> {
  return {
    ...feature,
    properties: { ...(feature.properties ?? {}) },
    geometry: structuredClone(feature.geometry),
  };
}

export function createPointFeature(coordinates: Position, properties: Record<string, unknown> = {}): Feature<Point> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates },
  };
}

export function createPolygonFeature(polygon: Polygon, properties: Record<string, unknown> = {}): Feature<Polygon> {
  return {
    type: "Feature",
    properties,
    geometry: polygon,
  };
}

export function isPointOnSegment(point: Position, start: Position, end: Position, tolerance = 1e-9): boolean {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);

  if (Math.abs(cross) > tolerance) return false;

  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  const lengthSquared = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;

  return dot >= -tolerance && dot <= lengthSquared + tolerance;
}

export function pointInPolygon(point: Position, polygon: Polygon): boolean {
  const ring = polygon.coordinates[0] ?? [];
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (isPointOnSegment(point, ring[j], ring[i])) return true;

    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function segmentsIntersect(a: Segment, b: Segment): boolean {
  const [a1, a2] = a;
  const [b1, b2] = b;
  const d1 = orientation(a1, a2, b1);
  const d2 = orientation(a1, a2, b2);
  const d3 = orientation(b1, b2, a1);
  const d4 = orientation(b1, b2, a2);

  if (d1 * d2 < 0 && d3 * d4 < 0) return true;

  return (
    (d1 === 0 && isPointOnSegment(b1, a1, a2)) ||
    (d2 === 0 && isPointOnSegment(b2, a1, a2)) ||
    (d3 === 0 && isPointOnSegment(a1, b1, b2)) ||
    (d4 === 0 && isPointOnSegment(a2, b1, b2))
  );
}

export function featureFromGeometry<TGeometry extends Geometry>(
  geometry: TGeometry,
  properties: Record<string, unknown> = {}
): Feature<TGeometry> {
  return {
    type: "Feature",
    properties,
    geometry,
  };
}

function orientation(a: Position, b: Position, c: Position): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(value) < 1e-12) return 0;
  return value;
}

function projectToWebMercator(position: Position): { x: number; y: number } {
  const latitude = Math.max(Math.min(position[1], WEB_MERCATOR_MAX_LATITUDE), -WEB_MERCATOR_MAX_LATITUDE);

  return {
    x: EARTH_RADIUS_M * toRadians(position[0]),
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2)),
  };
}

function getElevation(point: Position): number {
  return typeof point[2] === "number" && Number.isFinite(point[2]) ? point[2] : 0;
}

function normalizeBearing(value: number): number {
  const normalized = ((value + 540) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}
