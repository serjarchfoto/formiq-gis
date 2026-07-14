import type { DataSourceKind } from "@/types/formiq";
import type { FusionPriorityConfig } from "./types";

const DEFAULT_PRIORITIES: FusionPriorityConfig = {
  buildingGeometry: ["osm", "microsoft-buildings", "overture", "local-buildings", "city-geojson"],
  buildingAddress: ["osm", "overture", "city-geojson", "local-buildings"],
  buildingFunction: ["wikidata", "osm", "overture", "city-geojson", "local-buildings"],
  poi: ["wikidata", "overture", "city-geojson", "osm"],
};

export class FusionPriorityRegistry {
  constructor(private readonly config: FusionPriorityConfig = DEFAULT_PRIORITIES) {}

  getPriorities(key: keyof FusionPriorityConfig): DataSourceKind[] {
    return this.config[key];
  }
}
