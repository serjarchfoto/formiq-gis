import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { BoundingBox, GISLayerGeometryType } from "@/types/gis";
import type { SpatialImportDataset, SpatialImportFormat, SpatialImportLayer, SpatialImportRequest } from "./types";

export function createUnsupportedDataset(
  request: SpatialImportRequest,
  driver: string,
  message: string,
  futureGdalDriver?: string
): SpatialImportDataset {
  return {
    id: request.id,
    name: request.name,
    format: request.format,
    kind: isRasterFormat(request.format) ? "raster" : "vector",
    status: "unsupported",
    layers: [],
    metadata: {
      driver,
      crs: request.options?.crs ?? null,
      messages: [message],
      futureGdalDriver,
    },
  };
}

export function createVectorDataset(
  request: SpatialImportRequest,
  driver: string,
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>,
  message?: string
): SpatialImportDataset {
  const layer = createVectorLayer(
    request.options?.layerName ?? request.name,
    `${request.id}:layer:0`,
    featureCollection
  );

  return {
    id: request.id,
    name: request.name,
    format: request.format,
    kind: "vector",
    status: "ready",
    layers: [layer],
    metadata: {
      driver,
      crs: request.options?.crs ?? "EPSG:4326",
      messages: message ? [message] : [],
    },
  };
}

export function createVectorLayer(
  name: string,
  id: string,
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>
): SpatialImportLayer {
  return {
    id,
    name,
    geometryType: inferLayerGeometryType(featureCollection),
    featureCollection,
    featureCount: featureCollection.features.length,
    bbox: getFeatureCollectionBbox(featureCollection),
  };
}

export function getPayloadText(request: SpatialImportRequest): string | null {
  if (typeof request.payload === "string") return request.payload;
  if (request.payload instanceof Uint8Array) return new TextDecoder().decode(request.payload);
  if (request.payload instanceof ArrayBuffer) return new TextDecoder().decode(request.payload);
  return null;
}

export function isFeatureCollection(value: unknown): value is FeatureCollection<Geometry, GeoJsonProperties> {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "FeatureCollection");
}

export function normalizeFeatureCollection(
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature): feature is Feature<Geometry, GeoJsonProperties> =>
      Boolean(feature?.geometry)
    ),
  };
}

export function inferLayerGeometryType(featureCollection: FeatureCollection<Geometry, GeoJsonProperties>): GISLayerGeometryType {
  const firstGeometry = featureCollection.features.find((feature) => feature.geometry)?.geometry;

  if (!firstGeometry) return "point";
  if (firstGeometry.type.includes("Line")) return "line";
  if (firstGeometry.type.includes("Polygon")) return "polygon";
  return "point";
}

export function getFeatureCollectionBbox(
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>
): BoundingBox | null {
  const coordinates = featureCollection.features.flatMap((feature) => getFlatCoordinates(feature.geometry));

  if (!coordinates.length) return null;

  return coordinates.reduce<BoundingBox>(
    (bbox, coordinate) => ({
      west: Math.min(bbox.west, coordinate[0]),
      south: Math.min(bbox.south, coordinate[1]),
      east: Math.max(bbox.east, coordinate[0]),
      north: Math.max(bbox.north, coordinate[1]),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  );
}

export function getFlatCoordinates(geometry: Geometry | null): number[][] {
  if (!geometry) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

export function isRasterFormat(format: SpatialImportFormat): boolean {
  return format === "geotiff" || format === "dem" || format === "raster-dem" || format === "satellite";
}
