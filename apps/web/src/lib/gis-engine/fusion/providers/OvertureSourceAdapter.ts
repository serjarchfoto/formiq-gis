import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { SourceAdapter, SourceAdapterResult, SourceFeature } from "@/lib/gis-engine/fusion/types";
import { OvertureService } from "@/services/overture";
import { getFeatureId } from "./sourceAdapterUtils";

export class OvertureSourceAdapter implements SourceAdapter {
  readonly source = "overture" as const;
  readonly version = "v1";

  constructor(private readonly service = new OvertureService()) {}

  async fetch({ bounds }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const response = await this.service.loadByBoundingBox(bounds);

    return {
      source: this.source,
      version: this.version,
      features: response.features.flatMap((feature, index) => normalizeOvertureFeature(feature, index)),
    };
  }
}

function normalizeOvertureFeature(
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number
): SourceFeature[] {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const sourceFeatureId = getFeatureId(feature, `overture-${index}`);
  const base = {
    source: "overture" as const,
    sourceFeatureId,
    geometry: feature.geometry,
    tags: toStringMap(properties),
    names: properties.name ? { default: String(properties.name) } : undefined,
  };
  const category = String(properties.category ?? properties.type ?? "");

  if (feature.geometry?.type === "Polygon" && isBuildingLike(properties)) {
    return [
      {
        ...base,
        kind: "building",
        height: toNullableNumber(properties.height),
        levels: toNullableNumber(properties.levels),
        year: toNullableNumber(properties.year_built),
        usage: toNullableString(properties.class),
        material: toNullableString(properties.material),
        roof: toNullableString(properties.roof_shape),
        addressLabel: toNullableString(properties.address),
        objectType: toNullableString(properties.subtype ?? properties.type),
      },
    ];
  }

  if (feature.geometry?.type === "Point") {
    return [
      {
        ...base,
        kind: "poi",
        category: category || "poi",
        subtype: toNullableString(properties.subtype),
        name: toNullableString(properties.name),
      },
    ];
  }

  if (feature.geometry?.type === "Polygon" && category.includes("boundary")) {
    return [
      {
        ...base,
        kind: "boundary",
        adminLevel: toNullableString(properties.admin_level),
        name: toNullableString(properties.name),
      },
    ];
  }

  return [];
}

function isBuildingLike(properties: Record<string, unknown>): boolean {
  const category = String(properties.category ?? properties.type ?? "").toLowerCase();
  return category.includes("building") || "height" in properties || "levels" in properties;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringMap(properties: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string])
  );
}
