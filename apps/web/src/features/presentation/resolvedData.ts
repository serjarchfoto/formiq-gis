import type { FeatureCollection } from "geojson";
import type { FormiqEntity, FormiqLayerData, FormiqProjectData } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";

export interface DataProvenance {
  dataset: string;
  sources: string[];
  featureCount: number;
}

export interface FieldInventory {
  fields: Record<string, number>;
}

export interface ResolvedPresentationData {
  project: FormiqProjectData;
  buildings: FormiqProjectData["buildings"];
  roads: FormiqProjectData["roads"];
  vegetation: FormiqProjectData["vegetation"];
  water: FormiqProjectData["water"];
  poi: FormiqProjectData["poi"];
  transitStops: FormiqProjectData["transitStops"];
  terrain: FormiqProjectData["terrain"];
  boundaries: FormiqProjectData["boundaries"];
  bounds?: BoundingBox;
  sourceCrs: string;
  displayCrs: string;
  provenance: DataProvenance[];
  fieldInventory: FieldInventory;
}

type DatasetKey = "buildings" | "roads" | "vegetation" | "water" | "poi" | "transitStops" | "terrain" | "boundaries";

/**
 * Merge the three persisted representations without ever duplicating an
 * object. Project state has highest priority, followed by layer snapshots and
 * finally the fusion snapshot. Stable entity IDs are retained from the first
 * representation in that order.
 */
export function resolveProjectPresentationData(project: FormiqProjectData): ResolvedPresentationData {
  const layerData: FormiqLayerData[] = project.layers.length
    ? project.layers
    : project.layerSystem
        .map((layer) => layer.data)
        .filter((data): data is FormiqLayerData => Boolean(data && typeof data === "object" && "buildings" in data));
  const fusion = project.fusion?.collections;
  const sourceGroups: Record<DatasetKey, Array<{ source: string; items: FormiqEntity[] }>> = {
    buildings: [
      { source: "project", items: project.buildings },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.buildings })),
      { source: "fusion", items: fusion?.buildings ?? [] },
    ],
    roads: [
      { source: "project", items: project.roads },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.roads })),
      { source: "fusion", items: fusion?.roads ?? [] },
    ],
    vegetation: [
      { source: "project", items: project.vegetation },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.vegetation })),
      { source: "fusion", items: fusion?.vegetation ?? [] },
    ],
    water: [
      { source: "project", items: project.water },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.water })),
      { source: "fusion", items: fusion?.water ?? [] },
    ],
    poi: [
      { source: "project", items: project.poi },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.poi ?? [] })),
      { source: "fusion", items: fusion?.poi ?? [] },
    ],
    transitStops: [
      { source: "project", items: project.transitStops },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.transitStops ?? [] })),
      { source: "fusion", items: fusion?.transitStops ?? [] },
    ],
    terrain: [
      { source: "project", items: project.terrain },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.terrain })),
      { source: "fusion", items: fusion?.terrain ?? [] },
    ],
    boundaries: [
      { source: "project", items: project.boundaries },
      ...layerData.map((layer) => ({ source: layer.metadata.source, items: layer.boundaries ?? [] })),
      { source: "fusion", items: fusion?.boundaries ?? [] },
    ],
  };

  const resolved = Object.fromEntries(Object.entries(sourceGroups).map(([key, groups]) => [key, dedupeGroups(groups)])) as Record<DatasetKey, FormiqEntity[]>;
  const resolvedProject: FormiqProjectData = {
    ...project,
    buildings: resolved.buildings as FormiqProjectData["buildings"],
    roads: resolved.roads as FormiqProjectData["roads"],
    vegetation: resolved.vegetation as FormiqProjectData["vegetation"],
    water: resolved.water as FormiqProjectData["water"],
    poi: resolved.poi as FormiqProjectData["poi"],
    transitStops: resolved.transitStops as FormiqProjectData["transitStops"],
    terrain: resolved.terrain as FormiqProjectData["terrain"],
    boundaries: resolved.boundaries as FormiqProjectData["boundaries"],
  };
  const allEntities = Object.values(resolved).flat();
  const bounds = project.territories.find((territory) => territory.id === project.activeTerritoryId)?.bounds ?? project.metadata.bounds ?? getEntityBounds(allEntities);
  const sourceCrs = project.crs || "EPSG:4326";
  const provenance = (Object.keys(sourceGroups) as DatasetKey[]).map((dataset) => ({
    dataset,
    sources: Array.from(new Set(sourceGroups[dataset].flatMap((group) => group.items.length ? [group.source] : []))),
    featureCount: resolved[dataset].length,
  }));

  return {
    project: resolvedProject,
    buildings: resolvedProject.buildings,
    roads: resolvedProject.roads,
    vegetation: resolvedProject.vegetation,
    water: resolvedProject.water,
    poi: resolvedProject.poi,
    transitStops: resolvedProject.transitStops,
    terrain: resolvedProject.terrain,
    boundaries: resolvedProject.boundaries,
    bounds,
    sourceCrs,
    displayCrs: "EPSG:4326",
    provenance,
    fieldInventory: { fields: buildFieldInventory(allEntities) },
  };
}

function dedupeGroups(groups: Array<{ source: string; items: FormiqEntity[] }>): FormiqEntity[] {
  const entities = new Map<string, FormiqEntity>();
  groups.forEach((group) => group.items.forEach((entity) => {
    const key = entity.id || `${entity.type}:${geometryKey(entity)}`;
    if (!entities.has(key)) entities.set(key, entity);
  }));
  return Array.from(entities.values());
}

function geometryKey(entity: FormiqEntity): string {
  return JSON.stringify(entity.geometry);
}

function buildFieldInventory(entities: FormiqEntity[]): Record<string, number> {
  const fields: Record<string, number> = {};
  entities.forEach((entity) => {
    Object.keys(entity).forEach((key) => { fields[key] = (fields[key] ?? 0) + 1; });
    Object.keys(entity.tags ?? {}).forEach((key) => { fields[key] = (fields[key] ?? 0) + 1; });
  });
  return fields;
}

function getEntityBounds(entities: FormiqEntity[]): BoundingBox | undefined {
  const positions = entities.flatMap((entity) => {
    const geometry = entity.geometry;
    if (geometry.type === "point") return [geometry.coordinates];
    if (geometry.type === "line") return geometry.coordinates;
    return geometry.rings.flat();
  });
  if (!positions.length) return undefined;
  return {
    west: Math.min(...positions.map((position) => position[0])),
    south: Math.min(...positions.map((position) => position[1])),
    east: Math.max(...positions.map((position) => position[0])),
    north: Math.max(...positions.map((position) => position[1])),
  };
}

export function asFeatureCollection<T extends FormiqEntity>(entities: T[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entities.map((entity) => ({ type: "Feature", id: entity.id, properties: { id: entity.id, type: entity.type, source: entity.source }, geometry: entity.geometry as never })),
  };
}
