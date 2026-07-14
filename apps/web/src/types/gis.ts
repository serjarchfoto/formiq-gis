import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { FormiqLayerData } from "@/types/formiq";

export type GISImportFormat =
  | "geojson"
  | "shapefile"
  | "geopackage"
  | "kml"
  | "gpx"
  | "csv"
  | "dxf"
  | "geotiff"
  | "geoparquet";

export type RasterSourceType = "dem" | "raster-dem" | "satellite";

export type GISLayerGeometryType = "point" | "line" | "polygon";

export type GISLayerCategory =
  | "buildings"
  | "roads"
  | "green"
  | "water"
  | "terrain"
  | "boundaries"
  | "poi"
  | "transit"
  | "custom";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GISDataSource {
  id: string;
  name: string;
  format:
    | GISImportFormat
    | RasterSourceType
    | "osm"
    | "overture"
    | "microsoft-buildings"
    | "local-buildings"
    | "city-geojson"
    | "wikidata"
    | "pmtiles";
}

export interface GISLayerStyle {
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
  opacity?: number;
}

export interface GISLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  groupId?: string;
  locked?: boolean;
  sourceType: GISImportFormat | RasterSourceType | "osm" | "fusion" | "manual" | "pmtiles";
  removable: boolean;
  order: number;
  category: GISLayerCategory;
  geometryType: GISLayerGeometryType;
  source: GISDataSource;
  data?: FormiqLayerData | FeatureCollection<Geometry, GeoJsonProperties>;
  style: GISLayerStyle;
}
