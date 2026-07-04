import type { DataSourceKind } from "@/types/formiq";
import type { FusionPriorityConfig } from "./types";

const DEFAULT_PRIORITIES: FusionPriorityConfig = {
  buildingGeometry: ["microsoft-buildings", "overture", "osm"],
  buildingAddress: ["overture", "osm"],
  buildingFunction: ["wikidata", "overture", "osm"],
  poi: ["overture", "osm", "wikidata"],
};

export class FusionPriorityRegistry {
  constructor(private readonly config: FusionPriorityConfig = DEFAULT_PRIORITIES) {}

  getPriorities(key: keyof FusionPriorityConfig): DataSourceKind[] {
    return this.config[key];
  }
}
