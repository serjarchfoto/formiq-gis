import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";

export interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

export interface PMTilesMetadata {
  id: string;
  name: string;
  minZoom: number;
  maxZoom: number;
  bounds: BoundingBox | null;
  tileType: "mvt" | "png" | "jpg" | "webp" | "avif" | "mlt" | "unknown";
  vectorLayers: string[];
  attribution?: string;
  description?: string;
  center?: [number, number, number];
}

export interface OfflineTileSource {
  id: string;
  url?: string;
  file?: Blob;
  bytes?: ArrayBuffer | Uint8Array;
  metadata?: PMTilesMetadata;
}

export interface TilePayload {
  coordinate: TileCoordinate;
  contentType: string;
  data: Uint8Array;
}

export interface PMTilesAdapter {
  readMetadata(source: OfflineTileSource): Promise<PMTilesMetadata>;
  getTile(source: OfflineTileSource, coordinate: TileCoordinate): Promise<TilePayload | null>;
  queryFeatures?(source: OfflineTileSource, bbox: BoundingBox): Promise<FeatureCollection<Geometry, GeoJsonProperties>>;
  querySourceFeatures?(source: OfflineTileSource, bbox: BoundingBox): Promise<SourceFeature[]>;
}
