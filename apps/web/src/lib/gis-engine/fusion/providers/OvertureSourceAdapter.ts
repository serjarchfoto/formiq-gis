import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { GeoJsonProxySourceAdapter, normalizeGeneralGeoJsonFeature } from "./GeoJsonProxySourceAdapter";

export class OvertureSourceAdapter extends GeoJsonProxySourceAdapter {
  constructor() {
    super(
      "overture",
      "/api/data/overture",
      process.env.NEXT_PUBLIC_OVERTURE_API_URL,
      "general",
      "overture"
    );
  }

  protected normalizeFeature(feature: Feature<Geometry, GeoJsonProperties>, index: number): SourceFeature[] {
    return normalizeGeneralGeoJsonFeature(this.source, feature, index, "overture");
  }
}
