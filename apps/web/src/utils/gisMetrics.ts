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
  const outerArea = Math.abs(calculateRingArea(outerRing ?? []));
  const holesArea = holes.reduce((total, ring) => total + Math.abs(calculateRingArea(ring)), 0);

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

  return EARTH_RADIUS_M * c;
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
