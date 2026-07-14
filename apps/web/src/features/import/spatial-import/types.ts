import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { BoundingBox, GISImportFormat, GISLayerGeometryType, RasterSourceType } from "@/types/gis";

export type SpatialImportFormat = GISImportFormat | RasterSourceType;
export type SpatialImportPayload = string | ArrayBuffer | Uint8Array | FeatureCollection<Geometry, GeoJsonProperties>;
export type SpatialImportStatus = "ready" | "unsupported" | "error";
export type SpatialImportDatasetKind = "vector" | "raster";

export interface SpatialImportRequest {
  id: string;
  name: string;
  format: SpatialImportFormat;
  payload?: SpatialImportPayload;
  fileName?: string;
  options?: SpatialImportOptions;
}

export interface SpatialImportOptions {
  delimiter?: "," | ";" | "\t";
  longitudeField?: string;
  latitudeField?: string;
  geometryField?: string;
  crs?: string;
  layerName?: string;
}

export interface SpatialImportDataset {
  id: string;
  name: string;
  format: SpatialImportFormat;
  kind: SpatialImportDatasetKind;
  status: SpatialImportStatus;
  layers: SpatialImportLayer[];
  raster?: SpatialImportRaster;
  metadata: SpatialImportMetadata;
}

export interface SpatialImportLayer {
  id: string;
  name: string;
  geometryType: GISLayerGeometryType;
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>;
  featureCount: number;
  bbox: BoundingBox | null;
}

export interface SpatialImportRaster {
  bandCount: number | null;
  width: number | null;
  height: number | null;
  bbox: BoundingBox | null;
  dataType: string | null;
  noDataValue: number | null;
}

export interface SpatialImportMetadata {
  driver: string;
  crs: string | null;
  messages: string[];
  futureGdalDriver?: string;
  openOptions?: Record<string, string | number | boolean>;
}

export interface SpatialImportAdapter {
  readonly format: SpatialImportFormat;
  readonly label: string;
  readonly futureGdalDriver?: string;
  canParse(request: SpatialImportRequest): boolean;
  parse(request: SpatialImportRequest): Promise<SpatialImportDataset>;
}
