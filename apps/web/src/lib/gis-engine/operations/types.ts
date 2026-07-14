import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";
import type { BoundingBox } from "@/types/gis";

export type GISOperationAccuracy = "exact" | "approximate" | "limited";

export interface GISOperationMetadata {
  operation: string;
  accuracy: GISOperationAccuracy;
  note?: string;
}

export interface GISOperationResult<T> {
  value: T;
  metadata: GISOperationMetadata;
}

export type GISFeature<TGeometry extends Geometry = Geometry> = Feature<TGeometry, GeoJsonProperties>;
export type GISFeatureCollection<TGeometry extends Geometry = Geometry> = FeatureCollection<TGeometry, GeoJsonProperties>;
export type GISPointFeature = GISFeature<Point>;
export type GISLineFeature = GISFeature<LineString>;
export type GISPolygonFeature = GISFeature<Polygon>;

export interface BufferOptions {
  radiusMeters: number;
  steps?: number;
}

export interface SimplifyOptions {
  toleranceMeters: number;
  highQuality?: boolean;
}

export interface VoronoiOptions {
  bbox: BoundingBox;
}

export interface NearestPointResult {
  point: GISPointFeature;
  distanceMeters: number;
}

export type BooleanOperation =
  | "contains"
  | "within"
  | "intersects"
  | "disjoint"
  | "equals"
  | "point-in-polygon"
  | "point-on-line";

export type GeometryInput = GISFeature | Geometry;

export type Segment = [Position, Position];
