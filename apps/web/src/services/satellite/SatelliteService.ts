import type { BoundingBox } from "@/types/gis";

export class SatelliteService {
  async loadImagery(_bbox: BoundingBox): Promise<never> {
    void _bbox;
    throw new Error("Satellite imagery loading is not implemented yet.");
  }
}
