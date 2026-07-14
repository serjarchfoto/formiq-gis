import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface TileBuilderOptions {
  minZoom: number;
  maxZoom: number;
  layerName: string;
  simplificationBaseToleranceMeters?: number;
}

export interface VectorTileFeature {
  id: string;
  geometry: Geometry;
  properties: GeoJsonProperties;
}

export interface VectorTileLayer {
  name: string;
  features: VectorTileFeature[];
}

export interface BuiltVectorTile {
  coord: TileCoord;
  layers: VectorTileLayer[];
}

export interface TilePyramid {
  minZoom: number;
  maxZoom: number;
  tiles: BuiltVectorTile[];
}

export interface GeneralizationStep {
  id: string;
  apply(collection: FeatureCollection<Geometry, GeoJsonProperties>, zoom: number): FeatureCollection<Geometry, GeoJsonProperties>;
}
