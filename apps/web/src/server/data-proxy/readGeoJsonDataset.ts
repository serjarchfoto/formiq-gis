import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";

export type DataProxyBbox = [number, number, number, number];
export type DataProxyStatus = "ready" | "loading" | "not-configured" | "rate-limited" | "offline" | "error";

export interface DataProxyMetadata {
  sourceId: string;
  featureCount: number;
  bbox: DataProxyBbox;
  generatedAt: string;
  status: DataProxyStatus;
  message?: string;
  filePath?: string;
}

export type DataProxyFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties> & {
  metadata: DataProxyMetadata;
};

export async function readGeoJsonFile(filePath: string): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  if (!isSupportedGeoJsonPath(filePath)) {
    return emptyFeatureCollection();
  }

  try {
    await access(/* turbopackIgnore: true */ filePath);
  } catch {
    return emptyFeatureCollection();
  }

  const raw = await readFile(/* turbopackIgnore: true */ filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (isFeatureCollection(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed)) {
    return {
      type: "FeatureCollection",
      features: parsed.filter(isFeature),
    };
  }

  if (isFeature(parsed)) {
    return {
      type: "FeatureCollection",
      features: [parsed],
    };
  }

  return emptyFeatureCollection();
}

export async function readGeoJsonDatasetPath(
  datasetPath: string
): Promise<{ collection: FeatureCollection<Geometry, GeoJsonProperties>; files: string[] }> {
  if (!(await pathExists(datasetPath))) {
    return { collection: emptyFeatureCollection(), files: [] };
  }

  const datasetStat = await stat(/* turbopackIgnore: true */ datasetPath);
  const files = datasetStat.isDirectory()
    ? (await readdir(/* turbopackIgnore: true */ datasetPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && isSupportedGeoJsonPath(entry.name))
        .map((entry) => path.join(datasetPath, entry.name))
        .sort()
    : isSupportedGeoJsonPath(datasetPath)
      ? [datasetPath]
      : [];
  const collections = await Promise.all(files.map((filePath) => readGeoJsonFile(filePath)));

  return {
    collection: {
      type: "FeatureCollection",
      features: collections.flatMap((collection, collectionIndex) =>
        collection.features.map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            "_formiq:dataset": path.basename(files[collectionIndex]),
          },
        }))
      ),
    },
    files,
  };
}

export function filterFeatureCollectionByBbox(
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>,
  bbox: DataProxyBbox
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature) => featureIntersectsBbox(feature, bbox)),
  };
}

export function featureIntersectsBbox(feature: Feature<Geometry, GeoJsonProperties>, bbox: DataProxyBbox): boolean {
  const featureBbox = getFeatureBbox(feature);

  if (!featureBbox) {
    return false;
  }

  return bboxIntersects(featureBbox, bbox);
}

export function getFeatureBbox(feature: Feature<Geometry, GeoJsonProperties>): DataProxyBbox | null {
  if (!feature.geometry) {
    return null;
  }

  const coordinates = getFlatCoordinates(feature.geometry);

  if (!coordinates.length) {
    return null;
  }

  return coordinates.reduce<DataProxyBbox>(
    ([minLon, minLat, maxLon, maxLat], coordinate) => [
      Math.min(minLon, coordinate[0]),
      Math.min(minLat, coordinate[1]),
      Math.max(maxLon, coordinate[0]),
      Math.max(maxLat, coordinate[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

export function parseBboxParam(value: string | null): DataProxyBbox | null {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = parts;

  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
}

export function createDataProxyCollection(
  sourceId: string,
  bbox: DataProxyBbox,
  filePath: string,
  features: Feature<Geometry, GeoJsonProperties>[],
  status: DataProxyStatus,
  message?: string
): DataProxyFeatureCollection {
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      sourceId,
      featureCount: features.length,
      bbox,
      generatedAt: new Date().toISOString(),
      status,
      message,
      filePath,
    },
  };
}

export function resolveDatasetPath(envValue: string | undefined, fallbackFromWebRoot: string): string {
  if (envValue && envValue.trim().length > 0) {
    return path.resolve(/* turbopackIgnore: true */ envValue);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), fallbackFromWebRoot);
}

export function isSupportedGeoJsonPath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".geojson" || extension === ".json";
}

export function emptyFeatureCollection(): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(/* turbopackIgnore: true */ targetPath);
    return true;
  } catch {
    return false;
  }
}

function isFeatureCollection(value: unknown): value is FeatureCollection<Geometry, GeoJsonProperties> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

function isFeature(value: unknown): value is Feature<Geometry, GeoJsonProperties> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "Feature" &&
    typeof (value as { geometry?: unknown }).geometry === "object"
  );
}

function getFlatCoordinates(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function bboxIntersects(a: DataProxyBbox, b: DataProxyBbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
