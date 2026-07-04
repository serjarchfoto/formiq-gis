import type { GeoPoint } from "@/types/gis";

export interface GeocodingResult {
  label: string;
  point: GeoPoint;
}

export class GeocoderService {
  async search(_query: string): Promise<GeocodingResult[]> {
    void _query;
    throw new Error("Geocoding is not implemented yet.");
  }
}
