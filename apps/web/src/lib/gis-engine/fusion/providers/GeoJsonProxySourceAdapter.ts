import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type { DataSourceKind } from "@/types/formiq";
import type { SourceAdapter, SourceAdapterResult, SourceFeature } from "@/lib/gis-engine/fusion/types";
import { getFeatureId } from "./sourceAdapterUtils";

type ProxyStatus = "ready" | "loading" | "not-configured" | "rate-limited" | "offline" | "error";

interface ProxyFeatureCollection {
  type: "FeatureCollection";
  features: Array<Feature<Geometry, GeoJsonProperties>>;
  metadata?: {
    sourceId?: string;
    featureCount?: number;
    status?: ProxyStatus;
    message?: string;
  };
}

export abstract class GeoJsonProxySourceAdapter implements SourceAdapter {
  readonly version = "local-proxy-v1";

  protected constructor(
    readonly source: DataSourceKind,
    private readonly defaultEndpoint: string,
    private readonly envEndpoint?: string
  ) {}

  async fetch({ bounds }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const endpoint = this.envEndpoint || this.defaultEndpoint;
    const url = `${endpoint}?bbox=${encodeURIComponent(formatBbox(bounds))}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${this.source} proxy failed with status ${response.status}.`);
    }

    const geojson = (await response.json()) as ProxyFeatureCollection;
    const status = geojson.metadata?.status ?? "ready";

    return {
      source: this.source,
      version: this.version,
      features: status === "ready" ? geojson.features.flatMap((feature, index) => this.normalizeFeature(feature, index)) : [],
      metadata: {
        status,
        message: geojson.metadata?.message ?? "",
        featureCount: geojson.metadata?.featureCount ?? geojson.features.length,
      },
    };
  }

  protected abstract normalizeFeature(feature: Feature<Geometry, GeoJsonProperties>, index: number): SourceFeature[];
}

export function normalizeBuildingFeature(
  source: DataSourceKind,
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number,
  fallbackPrefix: string
): SourceFeature[] {
  if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") {
    return [];
  }

  const geometry = feature.geometry.type === "MultiPolygon" ? firstPolygon(feature.geometry) : feature.geometry;

  if (!geometry) {
    return [];
  }

  const properties = (feature.properties ?? {}) as Record<string, unknown>;

  return [
    {
      source,
      sourceFeatureId: getFeatureId(feature, `${fallbackPrefix}-${index}`),
      kind: "building",
      geometry,
      tags: toStringMap(properties),
      names: properties.name ? { default: String(properties.name) } : undefined,
      height: toNullableNumber(properties.height ?? properties.render_height),
      levels: toNullableNumber(properties.levels ?? properties["building:levels"]),
      year: toNullableNumber(properties.year ?? properties.year_built ?? properties.start_date),
      usage: toNullableString(properties.usage ?? properties.class ?? properties.function),
      material: toNullableString(properties.material ?? properties["building:material"]),
      roof: toNullableString(properties.roof ?? properties.roof_shape),
      addressLabel: toNullableString(properties.address ?? properties.addr_full),
      objectType: toNullableString(properties.subtype ?? properties.type ?? properties.building),
    },
  ];
}

export function normalizeGeneralGeoJsonFeature(
  source: DataSourceKind,
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number,
  fallbackPrefix: string
): SourceFeature[] {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const category = [
    properties.category,
    properties.type,
    properties.kind,
    properties.class,
    properties.layer,
    properties["_formiq:dataset"],
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (isBuildingLike(category, properties)) {
    return normalizeBuildingFeature(source, feature, index, fallbackPrefix);
  }

  if (isRoadLike(category, properties)) {
    return getLineStrings(feature.geometry).map((geometry, partIndex) => ({
        source,
        sourceFeatureId: `${getFeatureId(feature, `${fallbackPrefix}-road-${index}`)}-${partIndex}`,
        kind: "road",
        geometry,
        tags: toStringMap(properties),
        name: toNullableString(properties.name),
        roadType: toNullableString(properties.roadType ?? properties.highway ?? properties.class),
        surface: toNullableString(properties.surface),
        lanes: toNullableNumber(properties.lanes),
    }));
  }

  if (isBoundaryLike(category, properties)) {
    return getPolygons(feature.geometry).map((geometry, partIndex) => ({
      source,
      sourceFeatureId: `${getFeatureId(feature, `${fallbackPrefix}-boundary-${index}`)}-${partIndex}`,
      kind: "boundary",
      geometry,
      tags: toStringMap(properties),
      adminLevel: toNullableString(properties.adminLevel ?? properties.admin_level),
      name: toNullableString(properties.name),
    }));
  }

  if (isGreenLike(category, properties)) {
    return getPolygons(feature.geometry).map((geometry, partIndex) => ({
        source,
        sourceFeatureId: `${getFeatureId(feature, `${fallbackPrefix}-green-${index}`)}-${partIndex}`,
        kind: "vegetation",
        geometry,
        tags: toStringMap(properties),
        vegetationType: toNullableString(properties.vegetationType ?? properties.leisure ?? properties.landuse),
    }));
  }

  if (isWaterLike(category, properties)) {
    return getPolygons(feature.geometry).map((geometry, partIndex) => ({
        source,
        sourceFeatureId: `${getFeatureId(feature, `${fallbackPrefix}-water-${index}`)}-${partIndex}`,
        kind: "water",
        geometry,
        tags: toStringMap(properties),
        waterType: toNullableString(properties.waterType ?? properties.water ?? properties.natural),
    }));
  }

  if (feature.geometry?.type === "Point") {
    if (isTransitLike(category, properties)) {
      return [
        {
          source,
          sourceFeatureId: getFeatureId(feature, `${fallbackPrefix}-transit-${index}`),
          kind: "transit-stop",
          geometry: feature.geometry,
          tags: toStringMap(properties),
          network: toNullableString(properties.network ?? properties.operator),
          stopType: toNullableString(
            properties.stopType ??
              properties.public_transport ??
              properties.railway ??
              properties.highway
          ),
          name: toNullableString(properties.name),
        },
      ];
    }

    return [
      {
        source,
        sourceFeatureId: getFeatureId(feature, `${fallbackPrefix}-poi-${index}`),
        kind: "poi",
        geometry: feature.geometry,
        tags: toStringMap(properties),
        category: category || "poi",
        subtype: toNullableString(properties.subtype),
        name: toNullableString(properties.name),
      },
    ];
  }

  return [];
}

function formatBbox(bounds: BoundingBox): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
}

function firstPolygon(geometry: Extract<Geometry, { type: "MultiPolygon" }>): Extract<Geometry, { type: "Polygon" }> | null {
  const coordinates = geometry.coordinates[0];
  return coordinates ? { type: "Polygon", coordinates } : null;
}

function isBuildingLike(category: string, properties: Record<string, unknown>): boolean {
  return category.includes("building") || "building" in properties || "height" in properties || "levels" in properties;
}

function isRoadLike(category: string, properties: Record<string, unknown>): boolean {
  return (
    category.includes("road") ||
    category.includes("street") ||
    category.includes("transport_line") ||
    "highway" in properties
  );
}

function isGreenLike(category: string, properties: Record<string, unknown>): boolean {
  return (
    category.includes("green") ||
    category.includes("vegetation") ||
    category.includes("park") ||
    properties.landuse === "grass" ||
    properties.landuse === "forest" ||
    properties.natural === "wood" ||
    properties.leisure === "park"
  );
}

function isWaterLike(category: string, properties: Record<string, unknown>): boolean {
  return (
    category.includes("water") ||
    category.includes("river") ||
    category.includes("lake") ||
    properties.natural === "water" ||
    "water" in properties ||
    "waterway" in properties
  );
}

function isBoundaryLike(category: string, properties: Record<string, unknown>): boolean {
  return (
    category.includes("boundary") ||
    category.includes("border") ||
    properties.boundary === "administrative" ||
    "admin_level" in properties ||
    "adminLevel" in properties
  );
}

function isTransitLike(category: string, properties: Record<string, unknown>): boolean {
  return (
    category.includes("transit") ||
    category.includes("stop") ||
    category.includes("station") ||
    properties.highway === "bus_stop" ||
    properties.public_transport === "platform" ||
    properties.public_transport === "stop_position" ||
    properties.railway === "station" ||
    properties.railway === "halt" ||
    properties.amenity === "bus_station"
  );
}

function getLineStrings(geometry: Geometry | null): Array<Extract<Geometry, { type: "LineString" }>> {
  if (geometry?.type === "LineString") {
    return [geometry];
  }

  if (geometry?.type === "MultiLineString") {
    return geometry.coordinates.map((coordinates) => ({
      type: "LineString",
      coordinates,
    }));
  }

  return [];
}

function getPolygons(geometry: Geometry | null): Array<Extract<Geometry, { type: "Polygon" }>> {
  if (geometry?.type === "Polygon") {
    return [geometry];
  }

  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.map((coordinates) => ({
      type: "Polygon",
      coordinates,
    }));
  }

  return [];
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toStringMap(properties: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string])
  );
}
