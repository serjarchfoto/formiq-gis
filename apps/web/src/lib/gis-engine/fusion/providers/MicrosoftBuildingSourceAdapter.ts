import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceAdapter, SourceAdapterResult } from "@/lib/gis-engine/fusion/types";
import { MicrosoftBuildingFootprintsService } from "@/services/microsoft";
import { getFeatureId } from "./sourceAdapterUtils";

export class MicrosoftBuildingSourceAdapter implements SourceAdapter {
  readonly source = "microsoft-buildings" as const;
  readonly version = "v1";

  constructor(private readonly service = new MicrosoftBuildingFootprintsService()) {}

  async fetch({ bounds }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const response = await this.service.loadByBoundingBox(bounds);

    return {
      source: this.source,
      version: this.version,
      features: response.features
        .filter((feature) => feature.geometry?.type === "Polygon")
        .map((feature, index) => normalizeMicrosoftBuilding(feature, index)),
    };
  }
}

function normalizeMicrosoftBuilding(
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number
) {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;

  return {
    source: "microsoft-buildings" as const,
    sourceFeatureId: getFeatureId(feature, `microsoft-building-${index}`),
    kind: "building" as const,
    geometry: feature.geometry as Geometry,
    tags: Object.fromEntries(
      Object.entries(properties)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value as string])
    ),
    objectType: "building",
    height: typeof properties.height === "number" ? properties.height : null,
  };
}
