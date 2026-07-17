import type { Feature, FeatureCollection, Geometry, Polygon, Position } from "geojson";
import { clipFeatureCollectionToTerritory, isPointInsideTerritory } from "@/lib/gis-engine/geometry/clipToTerritory";
import type { TerritorySelection } from "@/store/selection";
import type { FormiqEntity, FormiqGeometry, FormiqProjectData } from "@/types/formiq";
import { clipLineToTerritory, clipPolygonToTerritory } from "@/lib/gis-engine/geometry/clipToTerritory";
import { createBoundingBox, createTerritorySelection } from "./selectionGeometry";

export type AreaValidationCode = "empty" | "open-ring" | "too-small" | "self-intersection" | "valid";
export interface AreaValidation { valid: boolean; code: AreaValidationCode; message: string; areaKm2: number; }

let currentArea: TerritorySelection | null = null;

export const AreaService = {
  setArea(area: TerritorySelection | null) { currentArea = area; return currentArea; },
  clear() { currentArea = null; },
  update(area: TerritorySelection) { currentArea = area; return currentArea; },
  getArea() { return currentArea; },
  clipFeatures<T extends Geometry>(features: FeatureCollection<T>, area = currentArea) {
    return area ? clipFeatureCollectionToTerritory(features, area.geometry) : features;
  },
  intersects(point: Position, area = currentArea) {
    return Boolean(area && isPointInsideTerritory(point, area.geometry));
  },
  contains(point: Position, area = currentArea) {
    return Boolean(area && isPointInsideTerritory(point, area.geometry));
  },
  getStatistics(area = currentArea) {
    if (!area) return null;
    const ring = area.geometry.geometry.coordinates[0] ?? [];
    return { bounds: createBoundingBox(ring), validation: validateArea(area) };
  },
  validate(area: TerritorySelection | null) { return validateArea(area); },
};

export function validateArea(area: TerritorySelection | null): AreaValidation {
  if (!area) return { valid: false, code: "empty", message: "Территория не выбрана", areaKm2: 0 };
  const ring = area.geometry.geometry.coordinates[0] ?? [];
  if (ring.length < 4) return { valid: false, code: "open-ring", message: "Контур должен содержать минимум три вершины и быть замкнут", areaKm2: 0 };
  const first = ring[0]; const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return { valid: false, code: "open-ring", message: "Контур не замкнут", areaKm2: 0 };
  const areaKm2 = Math.abs(ring.slice(1).reduce((sum, point, index) => sum + (ring[index][0] * point[1] - point[0] * ring[index][1]), 0)) * 12_364 / 2;
  if (!Number.isFinite(areaKm2) || areaKm2 < 0.000001) return { valid: false, code: "too-small", message: "Площадь территории слишком мала", areaKm2: 0 };
  for (let i = 0; i < ring.length - 1; i += 1) for (let j = i + 1; j < ring.length - 1; j += 1) {
    if (Math.abs(i - j) <= 1 || (i === 0 && j === ring.length - 2)) continue;
    if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return { valid: false, code: "self-intersection", message: "Контур содержит самопересечение", areaKm2 };
  }
  return { valid: true, code: "valid", message: "Геометрия корректна", areaKm2 };
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position) {
  const orient = (p: Position, q: Position, r: Position) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const ab1 = orient(a, b, c); const ab2 = orient(a, b, d); const cd1 = orient(c, d, a); const cd2 = orient(c, d, b);
  return ab1 * ab2 < 0 && cd1 * cd2 < 0;
}

export function areaFromPolygonFeature(feature: Feature<Polygon>): TerritorySelection {
  return createTerritorySelection(feature.geometry.coordinates[0] ?? [], "polygon");
}

/** Applies the active area boundary to canonical project entities before analysis. */
export function clipProjectToArea(project: FormiqProjectData, area: TerritorySelection | null): FormiqProjectData {
  if (!area) return project;
  const clip = <T extends FormiqEntity>(items: T[]) => items.flatMap((item) => {
    const geometry = clipFormiqGeometry(item.geometry, area.geometry);
    return geometry ? [{ ...item, geometry } as T] : [];
  });
  return {
    ...project,
    buildings: clip(project.buildings), roads: clip(project.roads), vegetation: clip(project.vegetation),
    water: clip(project.water), terrain: clip(project.terrain), boundaries: clip(project.boundaries),
    poi: clip(project.poi), transitStops: clip(project.transitStops),
  };
}

function clipFormiqGeometry(geometry: FormiqGeometry, area: Feature<Polygon>): FormiqGeometry | null {
  if (geometry.type === "point") return isPointInsideTerritory(geometry.coordinates, area) ? geometry : null;
  if (geometry.type === "line") {
    const clipped = clipLineToTerritory({ type: "LineString", coordinates: geometry.coordinates }, area);
    return clipped ? { type: "line", coordinates: clipped.coordinates } : null;
  }
  const polygon = { type: "Polygon", coordinates: geometry.rings } as Polygon;
  const clipped = clipPolygonToTerritory(polygon, area);
  if (!clipped) return null;
  return { type: "polygon", rings: clipped.coordinates };
}
