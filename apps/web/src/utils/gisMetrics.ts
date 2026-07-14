import type { Position } from "geojson";
import type { FormiqGeometry, FormiqLineGeometry, FormiqPolygonGeometry } from "@/types/formiq";

const EARTH_RADIUS_M = 6_371_000;

export function calculateGeometryArea(geometry: FormiqGeometry): number {
  if (geometry.type !== "polygon") {
    return 0;
  }

  return calculatePolygonArea(geometry);
}

export function calculatePolygonArea(geometry: FormiqPolygonGeometry): number {
  const [outerRing, ...holes] = geometry.rings;
  const areaCalculator = hasElevationSamples(outerRing ?? []) ? calculateSurfaceRingArea : calculateRingArea;
  const outerArea = Math.abs(areaCalculator(outerRing ?? []));
  const holesArea = holes.reduce((total, ring) => total + Math.abs(areaCalculator(ring)), 0);

  return Math.max(outerArea - holesArea, 0);
}

export function calculateGeometryLength(geometry: FormiqGeometry): number {
  if (geometry.type !== "line") {
    return 0;
  }

  return calculateLineLength(geometry);
}

export function calculateLineLength(geometry: FormiqLineGeometry): number {
  return geometry.coordinates.reduce((total, coordinate, index, coordinates) => {
    if (index === 0) {
      return total;
    }

    return total + distanceBetween(coordinates[index - 1], coordinate);
  }, 0);
}

function calculateRingArea(ring: Position[]): number {
  if (ring.length < 4) {
    return 0;
  }

  const projectedRing = ring.map(projectToWebMercator);

  return projectedRing.reduce((area, point, index) => {
    const nextPoint = projectedRing[(index + 1) % projectedRing.length];

    return area + point.x * nextPoint.y - nextPoint.x * point.y;
  }, 0) / 2;
}

function distanceBetween(start: Position, end: Position): number {
  const startLatitude = toRadians(start[1]);
  const endLatitude = toRadians(end[1]);
  const deltaLatitude = toRadians(end[1] - start[1]);
  const deltaLongitude = toRadians(end[0] - start[0]);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const planarDistance = EARTH_RADIUS_M * c;
  const deltaElevation = getElevation(end) - getElevation(start);

  return deltaElevation ? Math.hypot(planarDistance, deltaElevation) : planarDistance;
}

function calculateSurfaceRingArea(ring: Position[]): number {
  if (ring.length < 4) {
    return 0;
  }

  const origin = ring[0];
  const originPoint = projectToLocalMeters(origin, origin);
  let area = 0;

  for (let index = 1; index < ring.length - 2; index += 1) {
    const current = projectToLocalMeters(ring[index], origin);
    const next = projectToLocalMeters(ring[index + 1], origin);
    area += triangleArea3d(originPoint, current, next);
  }

  return area;
}

function triangleArea3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number }
): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };

  return Math.hypot(cross.x, cross.y, cross.z) / 2;
}

function projectToLocalMeters(
  position: Position,
  origin: Position
): { x: number; y: number; z: number } {
  const meanLatitude = toRadians(origin[1]);

  return {
    x: toRadians(position[0] - origin[0]) * EARTH_RADIUS_M * Math.cos(meanLatitude),
    y: toRadians(position[1] - origin[1]) * EARTH_RADIUS_M,
    z: getElevation(position),
  };
}

function hasElevationSamples(points: Position[]): boolean {
  return points.some((point) => typeof point[2] === "number" && Number.isFinite(point[2]));
}

function getElevation(point: Position): number {
  return typeof point[2] === "number" && Number.isFinite(point[2]) ? point[2] : 0;
}

function projectToWebMercator(position: Position): { x: number; y: number } {
  const longitude = position[0];
  const latitude = Math.max(Math.min(position[1], 85.05112878), -85.05112878);
  const x = EARTH_RADIUS_M * toRadians(longitude);
  const y =
    EARTH_RADIUS_M *
    Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2));

  return { x, y };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
