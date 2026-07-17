import type { DataSourceKind } from "@/types/formiq";

export type SourcePriorityRole = "buildings" | "functions" | "poi" | "transport" | "terrain";

export interface PrioritizedSource {
  id: string;
  priority: "primary" | "secondary" | "fallback";
  enabledByDefault?: boolean;
  configured?: boolean;
}

/**
 * Central source policy. Adapters are registered separately, so adding a
 * provider does not require changing fusion or analysis calculators.
 */
export const SOURCE_PRIORITY_PLAN: Record<SourcePriorityRole, PrioritizedSource[]> = {
  buildings: [
    { id: "osm", priority: "primary", enabledByDefault: true },
    { id: "microsoft-buildings", priority: "secondary", enabledByDefault: true },
    { id: "overture", priority: "secondary", enabledByDefault: true },
    { id: "open-aerial-map", priority: "fallback", enabledByDefault: false },
  ],
  functions: [
    { id: "osm", priority: "primary", enabledByDefault: true },
    { id: "wikidata", priority: "secondary", enabledByDefault: true },
    { id: "city-geojson", priority: "secondary", enabledByDefault: true },
    { id: "national-geospatial-portal", priority: "fallback", enabledByDefault: false },
  ],
  poi: [
    { id: "osm", priority: "primary", enabledByDefault: true },
    { id: "wikidata", priority: "secondary", enabledByDefault: true },
    { id: "overture", priority: "secondary", enabledByDefault: true },
    { id: "national-geospatial-portal", priority: "fallback", enabledByDefault: false },
  ],
  transport: [
    { id: "osm", priority: "primary", enabledByDefault: true },
    { id: "gtfs", priority: "secondary", enabledByDefault: false },
    { id: "national-geospatial-portal", priority: "fallback", enabledByDefault: false },
  ],
  terrain: [
    { id: "copernicus-dem", priority: "primary", enabledByDefault: true },
    { id: "nasa-srtm", priority: "secondary", enabledByDefault: false },
    { id: "open-topography", priority: "secondary", enabledByDefault: true },
    { id: "open-elevation", priority: "fallback", enabledByDefault: false },
    { id: "aster-gdem", priority: "fallback", enabledByDefault: false },
    { id: "mapbox-terrain", priority: "fallback", enabledByDefault: false },
  ],
};

export function getSourcePriorityPlan(role: SourcePriorityRole): PrioritizedSource[] {
  return SOURCE_PRIORITY_PLAN[role].map((source) => ({ ...source }));
}

export function getRegisteredSourceIds(role: SourcePriorityRole, available: Iterable<string>): DataSourceKind[] {
  const known = new Set(available);
  return getSourcePriorityPlan(role)
    .filter((source) => known.has(source.id))
    .map((source) => source.id as DataSourceKind);
}

export function chooseBestSourceResult<T extends { features: unknown[]; metadata?: Record<string, unknown> }>(results: T[]): T | null {
  return results.reduce<T | null>((best, result) => {
    if (result.features.length === 0) return best;
    if (!best || result.features.length > best.features.length) return result;
    return best;
  }, null);
}
