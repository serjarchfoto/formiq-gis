import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { GeoJsonProxySourceAdapter, normalizeGeneralGeoJsonFeature } from "./GeoJsonProxySourceAdapter";

export class CityGeoJsonSourceAdapter extends GeoJsonProxySourceAdapter {
  constructor() {
    super("city-geojson", "/api/data/city-geojson", process.env.NEXT_PUBLIC_CITY_GEOJSON_API_URL);
  }

  protected normalizeFeature(feature: Feature<Geometry, GeoJsonProperties>, index: number): SourceFeature[] {
    return normalizeGeneralGeoJsonFeature(this.source, feature, index, "city-geojson");
  }
}
