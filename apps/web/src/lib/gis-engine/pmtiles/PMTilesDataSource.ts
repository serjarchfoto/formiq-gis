import type { IDataSource, DataSourceFetchContext, DataSourceHealth, DataSourceResult } from "@/lib/gis-engine/data-source/types";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import type { OfflineTileSource, PMTilesAdapter, TileCoordinate, TilePayload } from "./types";

export class PMTilesDataSource implements IDataSource {
  readonly id = "pmtiles" as const;
  readonly name = "PMTiles Offline Source";
  readonly mode = "offline" as const;
  readonly version = "pmtiles-adapter-v1";
  readonly status = "ready" as const;
  readonly supportsBBox = true;
  readonly supportsTiles = true;
  readonly cache = { memory: true, disk: false, ttlMs: 30 * 60 * 1000 };

  constructor(private readonly source: OfflineTileSource, private readonly adapter: PMTilesAdapter) {}

  async authenticate(): Promise<"ready"> {
    return "ready";
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const metadata = await this.adapter.readMetadata(this.source);

    return {
      source: this.id,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: `PMTiles source ready: ${metadata.name}`,
    };
  }

  async fetch(context: DataSourceFetchContext): Promise<DataSourceResult> {
    const metadata = await this.adapter.readMetadata(this.source);
    const sourceFeatures = await this.adapter.querySourceFeatures?.(this.source, context.bbox) ?? [];
    const features = sourceFeatures.length > 0
      ? toFeatureCollection(sourceFeatures)
      : await this.adapter.queryFeatures?.(this.source, context.bbox) ?? emptyFeatureCollection();

    return {
      status: "ready",
      source: this.id,
      bbox: context.bbox,
      timestamp: new Date().toISOString(),
      features,
      adapterResult: {
        source: this.id,
        version: this.version,
        features: sourceFeatures,
        metadata: {
          sourceId: this.source.id,
          sourceUrl: this.source.url ?? "",
          tileType: metadata.tileType,
          minZoom: metadata.minZoom,
          maxZoom: metadata.maxZoom,
          bounds: metadata.bounds ? `${metadata.bounds.west},${metadata.bounds.south},${metadata.bounds.east},${metadata.bounds.north}` : "",
          vectorLayers: metadata.vectorLayers.join(","),
        },
      },
      metadata: {
        sourceId: this.source.id,
        tileType: metadata.tileType,
        maxZoom: metadata.maxZoom,
      },
    };
  }

  async import(context: DataSourceFetchContext): Promise<DataSourceResult> {
    return this.fetch(context);
  }

  async getTile(coordinate: TileCoordinate): Promise<TilePayload | null> {
    return this.adapter.getTile(this.source, coordinate);
  }
}

function emptyFeatureCollection(): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function toFeatureCollection(features: SourceFeature[]): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      id: feature.sourceFeatureId,
      geometry: feature.geometry,
      properties: {
        ...sourceFeatureProperties(feature),
        "_formiq:source": feature.source,
        "_formiq:kind": feature.kind,
        "_formiq:sourceFeatureId": feature.sourceFeatureId,
      },
    })),
  };
}

function sourceFeatureProperties(feature: SourceFeature): GeoJsonProperties {
  const properties: Record<string, string | number | boolean | null> = { ...feature.tags };
  for (const key of ["height", "levels", "year", "usage", "material", "roof", "addressLabel", "objectType", "roadType", "surface", "lanes", "vegetationType", "waterType", "adminLevel", "name", "category", "subtype", "network", "stopType", "elevation", "slope"] as const) {
    if (key in feature) {
      const value = feature[key as keyof SourceFeature];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        properties[key] = value;
      }
    }
  }
  return properties;
}
