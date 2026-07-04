import type { BoundingBox } from "@/types/gis";

export class TerrainService {
  async loadDEM(_bbox: BoundingBox): Promise<never> {
    void _bbox;
    throw new Error("DEM loading is not implemented yet.");
  }
}
