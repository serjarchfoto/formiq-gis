import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { GeoJsonProxySourceAdapter, normalizeBuildingFeature } from "./GeoJsonProxySourceAdapter";

export class MicrosoftBuildingSourceAdapter extends GeoJsonProxySourceAdapter {
  constructor() {
    super(
      "microsoft-buildings",
      "/api/data/microsoft-buildings",
      process.env.NEXT_PUBLIC_MICROSOFT_BUILDINGS_API_URL
    );
  }

  protected normalizeFeature(feature: Feature<Geometry, GeoJsonProperties>, index: number): SourceFeature[] {
    return normalizeBuildingFeature(this.source, feature, index, "microsoft-building");
  }
}
