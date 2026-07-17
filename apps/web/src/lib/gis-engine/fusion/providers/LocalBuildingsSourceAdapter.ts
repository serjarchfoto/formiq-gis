import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { GeoJsonProxySourceAdapter, normalizeBuildingFeature } from "./GeoJsonProxySourceAdapter";

export class LocalBuildingsSourceAdapter extends GeoJsonProxySourceAdapter {
  constructor() {
    super(
      "local-buildings",
      "/api/data/local-buildings",
      process.env.NEXT_PUBLIC_LOCAL_BUILDINGS_API_URL,
      "building",
      "local-building"
    );
  }

  protected normalizeFeature(feature: Feature<Geometry, GeoJsonProperties>, index: number): SourceFeature[] {
    return normalizeBuildingFeature(this.source, feature, index, "local-building");
  }
}
