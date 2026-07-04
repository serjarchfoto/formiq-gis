import { OverpassService } from "@/services/overpass";
import type { OverpassResponse } from "@/services/overpass";
import type { BoundingBox } from "@/types/gis";

export class OSMService {
  constructor(private readonly overpassService = new OverpassService()) {}

  async loadByBoundingBox(bbox: BoundingBox): Promise<OverpassResponse> {
    return this.overpassService.loadArchitecturalContext(bbox);
  }
}
