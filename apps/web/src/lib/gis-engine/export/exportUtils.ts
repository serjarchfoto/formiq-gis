import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, LineString, Point, Polygon, Position } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type {
  FormiqEntity,
  FormiqGeometry,
  FormiqLineGeometry,
  FormiqPointGeometry,
  FormiqPolygonGeometry,
  FormiqProjectData,
} from "@/types/formiq";

export function getProjectEntities(project: FormiqProjectData): FormiqEntity[] {
  return [
    ...project.buildings,
    ...project.roads,
    ...project.vegetation,
    ...project.water,
    ...project.terrain,
    ...project.boundaries,
    ...project.poi,
    ...project.transitStops,
  ];
}

export function filterEntitiesByBbox(entities: FormiqEntity[], bbox?: BoundingBox): FormiqEntity[] {
  if (!bbox) return entities;
  return entities.filter((entity) => {
    const bounds = getGeometryBounds(entity.geometry);
    return Boolean(bounds && bounds.east >= bbox.west && bounds.west <= bbox.east && bounds.north >= bbox.south && bounds.south <= bbox.north);
  });
}

export function filterEntitiesByIds(entities: FormiqEntity[], selectedIds?: string[]): FormiqEntity[] {
  if (!selectedIds?.length) return entities;
  const ids = new Set(selectedIds);
  return entities.filter((entity) => ids.has(entity.id));
}

export function entityToFeature(entity: FormiqEntity): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id: entity.id,
    geometry: formiqGeometryToGeoJson(entity.geometry),
    properties: entityProperties(entity),
  };
}

export function entitiesToFeatureCollection(
  project: FormiqProjectData,
  entities: FormiqEntity[]
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: entities.map(entityToFeature),
  };
}

export function formiqGeometryToGeoJson(geometry: FormiqGeometry): Geometry {
  if (geometry.type === "point") return pointToGeoJson(geometry);
  if (geometry.type === "line") return lineToGeoJson(geometry);
  return polygonToGeoJson(geometry);
}

export function entityProperties(entity: FormiqEntity): GeoJsonProperties {
  const common: Record<string, string | number | boolean | null> = {
    id: entity.id,
    type: entity.type,
    source: entity.source,
    confidence: entity.confidence,
    lifecycleState: entity.lifecycleState,
    ...entity.tags,
  };

  if (entity.type === "building") {
    return {
      ...common,
      height: entity.height,
      absoluteHeight: entity.absoluteHeight,
      levels: entity.levels,
      area: entity.area,
      volume: entity.volume,
      year: entity.year,
      usage: entity.usage,
      material: entity.material,
      roof: entity.roof,
      addressLabel: entity.addressLabel,
    };
  }

  if (entity.type === "road") {
    return {
      ...common,
      length: entity.length,
      roadType: entity.roadType,
      surface: entity.surface,
      name: entity.name,
      lanes: entity.lanes,
    };
  }

  if (entity.type === "vegetation") return { ...common, area: entity.area, vegetationType: entity.vegetationType };
  if (entity.type === "water") return { ...common, area: entity.area, waterType: entity.waterType };
  if (entity.type === "terrain") return { ...common, elevation: entity.elevation, slope: entity.slope };
  if (entity.type === "boundary") return { ...common, adminLevel: entity.adminLevel, name: entity.name };
  if (entity.type === "poi") return { ...common, category: entity.category, subtype: entity.subtype, name: entity.name };
  return { ...common, network: entity.network, stopType: entity.stopType, name: entity.name };
}

export function getGeometryBounds(geometry: FormiqGeometry): BoundingBox | null {
  const positions = getGeometryPositions(geometry);
  if (!positions.length) return null;
  return positions.reduce<BoundingBox>((bounds, position) => ({
    west: Math.min(bounds.west, position[0]),
    south: Math.min(bounds.south, position[1]),
    east: Math.max(bounds.east, position[0]),
    north: Math.max(bounds.north, position[1]),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity });
}

export function getProjectBounds(project: FormiqProjectData): BoundingBox {
  const bounds = getProjectEntities(project)
    .map((entity) => getGeometryBounds(entity.geometry))
    .filter((value): value is BoundingBox => Boolean(value));

  if (!bounds.length) {
    return project.metadata.bounds ?? { west: -180, south: -85, east: 180, north: 85 };
  }

  return bounds.reduce<BoundingBox>((merged, item) => ({
    west: Math.min(merged.west, item.west),
    south: Math.min(merged.south, item.south),
    east: Math.max(merged.east, item.east),
    north: Math.max(merged.north, item.north),
  }), bounds[0]);
}

export function getGeometryPositions(geometry: FormiqGeometry): Position[] {
  if (geometry.type === "point") return [geometry.coordinates];
  if (geometry.type === "line") return geometry.coordinates;
  return geometry.rings.flat();
}

export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function sanitizeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "formiq-export";
}

function pointToGeoJson(geometry: FormiqPointGeometry): Point {
  return { type: "Point", coordinates: geometry.coordinates };
}

function lineToGeoJson(geometry: FormiqLineGeometry): LineString {
  return { type: "LineString", coordinates: geometry.coordinates };
}

function polygonToGeoJson(geometry: FormiqPolygonGeometry): Polygon {
  return { type: "Polygon", coordinates: geometry.rings };
}
