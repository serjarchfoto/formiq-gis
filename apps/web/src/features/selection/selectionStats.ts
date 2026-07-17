import type { Position } from "geojson";
import type { FormiqGeometry, FormiqProjectData } from "@/types/formiq";
import type { TerritorySelection } from "@/store/selection";

export interface SelectionStats {
  areaKm2: number;
  perimeterKm: number;
  center: Position;
  counts: { buildings: number; roads: number; vegetation: number; water: number; imported: number };
}

const R = 6_371_008.8;
const rad = (value: number) => (value * Math.PI) / 180;

export function calculateSelectionStats(selection: TerritorySelection, project: FormiqProjectData): SelectionStats {
  const ring = selection.geometry.geometry.coordinates[0] ?? [];
  const center: Position = [
    ring.reduce((sum, point) => sum + point[0], 0) / Math.max(ring.length - 1, 1),
    ring.reduce((sum, point) => sum + point[1], 0) / Math.max(ring.length - 1, 1),
  ];
  let area = 0;
  let perimeter = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const a = ring[index - 1];
    const b = ring[index];
    area += rad(b[0] - a[0]) * (2 + Math.sin(rad(a[1])) + Math.sin(rad(b[1])));
    perimeter += haversine(a, b);
  }
  const inside = (geometry: FormiqGeometry) => pointInPolygon(representativePoint(geometry), ring);
  const collections = project.fusion?.collections;
  const buildings = project.buildings.length ? project.buildings : collections?.buildings ?? [];
  const roads = project.roads.length ? project.roads : collections?.roads ?? [];
  const vegetation = project.vegetation.length ? project.vegetation : collections?.vegetation ?? [];
  const water = project.water.length ? project.water : collections?.water ?? [];
  return {
    areaKm2: Math.abs(area * R * R / 2) / 1_000_000,
    perimeterKm: perimeter / 1000,
    center,
    counts: {
      buildings: buildings.filter((item) => inside(item.geometry)).length,
      roads: roads.filter((item) => inside(item.geometry)).length,
      vegetation: vegetation.filter((item) => inside(item.geometry)).length,
      water: water.filter((item) => inside(item.geometry)).length,
      imported: project.layers.reduce((sum, layer) => sum + (layer.metadata.featureCount ?? 0), 0),
    },
  };
}

function representativePoint(geometry: FormiqGeometry): Position {
  if (geometry.type === "point") return geometry.coordinates;
  const points = geometry.type === "line" ? geometry.coordinates : geometry.rings[0] ?? [];
  return points[0] ?? [0, 0];
}

function pointInPolygon(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function haversine(a: Position, b: Position): number {
  const dLat = rad(b[1] - a[1]); const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
