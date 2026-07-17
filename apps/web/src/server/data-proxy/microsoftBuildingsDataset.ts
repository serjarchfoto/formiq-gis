import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import {
  createDataProxyCollection,
  type DataProxyBbox,
  type DataProxyFeatureCollection,
  featureIntersectsBbox,
  filterFeatureCollectionByBbox,
  parseBboxParam,
  resolveDatasetPath,
} from "./readGeoJsonDataset";

interface DatasetLinkRow {
  location: string;
  quadKey: string;
  url: string;
  size: string;
  uploadDate: string;
}

interface MicrosoftDatasetOptions {
  sourceId: string;
  bbox: DataProxyBbox;
  indexPath: string;
  maxFiles?: number;
  maxFeatures?: number;
  maxPartitionBytes?: number;
}

const DATASET_ZOOM = 9;
export const DEFAULT_MICROSOFT_BUILDINGS_MAX_FILES = 64;
export const DEFAULT_MICROSOFT_BUILDINGS_MAX_FEATURES = 500_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120000;
const DEFAULT_MAX_PARTITION_BYTES = 128 * 1024 * 1024;

export async function readMicrosoftBuildingsDataset({
  sourceId,
  bbox,
  indexPath,
  maxFiles = parsePositiveInt(process.env.MICROSOFT_BUILDINGS_MAX_FILES, DEFAULT_MICROSOFT_BUILDINGS_MAX_FILES),
  maxFeatures = parsePositiveInt(process.env.MICROSOFT_BUILDINGS_MAX_FEATURES, DEFAULT_MICROSOFT_BUILDINGS_MAX_FEATURES),
  maxPartitionBytes = parsePositiveInt(
    process.env.MICROSOFT_BUILDINGS_MAX_PARTITION_BYTES,
    DEFAULT_MAX_PARTITION_BYTES
  ),
}: MicrosoftDatasetOptions): Promise<DataProxyFeatureCollection> {
  if (!(await fileExists(indexPath))) {
    return createDataProxyCollection(
      sourceId,
      bbox,
      indexPath,
      [],
      "not-configured",
      "Microsoft dataset-links.csv is not configured"
    );
  }

  const matchingQuadKeys = getQuadKeysForBbox(bbox, DATASET_ZOOM);
  const rows = await readDatasetLinks(indexPath);
  const allMatchingRows = rows.filter((row) => matchingQuadKeys.has(row.quadKey));
  const matchingRows = allMatchingRows.slice(0, maxFiles);

  if (matchingRows.length === 0) {
    return createDataProxyCollection(
      sourceId,
      bbox,
      indexPath,
      [],
      "ready",
      "bbox returned 0 Microsoft dataset partitions"
    );
  }

  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  const errors: string[] = [];
  const oversized = matchingRows.filter((row) => parseSizeToBytes(row.size) > maxPartitionBytes);

  for (const row of matchingRows) {
    if (features.length >= maxFeatures) break;
    const partitionBytes = parseSizeToBytes(row.size);

    if (partitionBytes > maxPartitionBytes) {
      errors.push(`${row.quadKey}: partition is too large (${row.size})`);
      continue;
    }

    try {
      const downloaded = await fetchMicrosoftPartition(row, bbox, maxFeatures - features.length);
      features.push(...downloaded);
    } catch (error) {
      errors.push(`${row.quadKey}: ${error instanceof Error ? error.message : "download error"}`);
    }
  }

  const filtered = filterFeatureCollectionByBbox({ type: "FeatureCollection", features }, bbox);
  const truncatedByFiles = matchingRows.length < allMatchingRows.length;
  const truncatedByFeatures = features.length >= maxFeatures;
  const truncated = truncatedByFiles || truncatedByFeatures || errors.length > 0;
  const status = truncated ? "error" : filtered.features.length > 0 ? "ready" : errors.length === matchingRows.length ? "offline" : "ready";
  const message =
    status === "ready"
      ? `Loaded ${filtered.features.length} Microsoft buildings from ${matchingRows.length}/${allMatchingRows.length} dataset partition(s)`
      : status === "error"
        ? `Microsoft dataset is incomplete: loaded ${filtered.features.length} buildings from ${matchingRows.length}/${allMatchingRows.length} partition(s). Increase configured limits or retry failed partitions.`
      : errors[0] ?? "bbox returned 0 Microsoft buildings";
  const response = createDataProxyCollection(sourceId, bbox, indexPath, filtered.features, status, message);

  return {
    ...response,
    metadata: {
      ...response.metadata,
      datasetFiles: matchingRows.length,
      matchingDatasetFiles: allMatchingRows.length,
      matchedQuadKeys: matchingQuadKeys.size,
      maxFiles,
      maxFeatures,
      maxPartitionBytes,
      oversizedPartitions: oversized.length,
      errors: errors.slice(0, 5),
      truncated,
      truncatedByFiles,
      truncatedByFeatures,
    } as DataProxyFeatureCollection["metadata"] & {
      datasetFiles: number;
      matchingDatasetFiles: number;
      matchedQuadKeys: number;
      maxFiles: number;
      maxFeatures: number;
      maxPartitionBytes: number;
      oversizedPartitions: number;
      errors: string[];
      truncated: boolean;
      truncatedByFiles: boolean;
      truncatedByFeatures: boolean;
    },
  };
}

export function resolveMicrosoftDatasetIndexPath(envValue: string | undefined): string {
  return resolveDatasetPath(envValue, "data/microsoft-buildings/dataset-links.csv");
}

export { parseBboxParam };

async function readDatasetLinks(indexPath: string): Promise<DatasetLinkRow[]> {
  const raw = await readFile(/* turbopackIgnore: true */ indexPath, "utf8");
  const records = parseCsv(raw);
  const [header, ...rows] = records;
  const column = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));

  return rows
    .map((record) => ({
      location: getCsvValue(record, column, "location"),
      quadKey: getCsvValue(record, column, "quadkey"),
      url: getCsvValue(record, column, "url"),
      size: getCsvValue(record, column, "size"),
      uploadDate: getCsvValue(record, column, "uploaddate"),
    }))
    .filter((row) => row.quadKey && row.url);
}

async function fetchMicrosoftPartition(
  row: DatasetLinkRow,
  bbox: DataProxyBbox,
  maxFeatures: number
): Promise<Feature<Geometry, GeoJsonProperties>[]> {
  const cachePath = await getCachedMicrosoftPartitionPath(row);
  await ensureMicrosoftPartitionCache(row, cachePath);
  return readMicrosoftPartitionCache(row, bbox, maxFeatures, cachePath);
}

async function ensureMicrosoftPartitionCache(row: DatasetLinkRow, cachePath: string): Promise<void> {
  if (await fileExists(cachePath)) {
    return;
  }

  await mkdir(/* turbopackIgnore: true */ path.dirname(cachePath), { recursive: true });

  const response = await fetch(row.url, {
    headers: {
      "accept-encoding": "gzip",
    },
    signal: AbortSignal.timeout(parsePositiveInt(process.env.MICROSOFT_BUILDINGS_TIMEOUT_MS, DEFAULT_DOWNLOAD_TIMEOUT_MS)),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("empty response body");
  }

  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(/* turbopackIgnore: true */ tempPath)
    );
    await rename(/* turbopackIgnore: true */ tempPath, /* turbopackIgnore: true */ cachePath);
  } catch (error) {
    await unlink(/* turbopackIgnore: true */ tempPath).catch(() => undefined);
    throw error;
  }
}

async function readMicrosoftPartitionCache(
  row: DatasetLinkRow,
  bbox: DataProxyBbox,
  maxFeatures: number,
  cachePath: string
): Promise<Feature<Geometry, GeoJsonProperties>[]> {
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  const input = (await isGzipFile(cachePath))
    ? createReadStream(/* turbopackIgnore: true */ cachePath).pipe(createGunzip())
    : createReadStream(/* turbopackIgnore: true */ cachePath);
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (!line.trim()) continue;
    if (features.length >= maxFeatures) break;

    const parsed = JSON.parse(line) as unknown;
    if (!isFeature(parsed)) continue;

    features.push({
      ...parsed,
      properties: {
        ...(parsed.properties ?? {}),
        "_formiq:dataset": "microsoft-buildings",
        "_formiq:location": row.location,
        "_formiq:quadKey": row.quadKey,
        "_formiq:uploadDate": row.uploadDate,
      },
    });

    if (!featureIntersectsBbox(features[features.length - 1], bbox)) {
      features.pop();
    }
  }

  return features;
}

async function getCachedMicrosoftPartitionPath(row: DatasetLinkRow): Promise<string> {
  const cacheRoot = process.env.MICROSOFT_BUILDINGS_CACHE_PATH?.trim()
    ? path.resolve(/* turbopackIgnore: true */ process.env.MICROSOFT_BUILDINGS_CACHE_PATH)
    : path.join(
        /* turbopackIgnore: true */ process.env.VERCEL ? "/tmp" : process.cwd(),
        "formiq/microsoft-buildings"
      );
  const fileName = `${sanitizePathPart(row.location)}-${sanitizePathPart(row.quadKey)}-${sanitizePathPart(row.uploadDate)}.partition`;

  return path.join(cacheRoot, fileName);
}

async function isGzipFile(filePath: string): Promise<boolean> {
  const file = await open(/* turbopackIgnore: true */ filePath, "r");
  const buffer = Buffer.alloc(2);

  try {
    await file.read(buffer, 0, 2, 0);
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  } finally {
    await file.close();
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
}

function getQuadKeysForBbox(bbox: DataProxyBbox, zoom: number): Set<string> {
  const [west, south, east, north] = bbox;
  const minTile = lonLatToTile(west, north, zoom);
  const maxTile = lonLatToTile(east, south, zoom);
  const quadKeys = new Set<string>();

  for (let x = minTile.x; x <= maxTile.x; x += 1) {
    for (let y = minTile.y; y <= maxTile.y; y += 1) {
      quadKeys.add(tileToQuadKey(x, y, zoom));
    }
  }

  return quadKeys;
}

function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const scale = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * scale);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale);

  return {
    x: Math.max(0, Math.min(scale - 1, x)),
    y: Math.max(0, Math.min(scale - 1, y)),
  };
}

function tileToQuadKey(x: number, y: number, zoom: number): string {
  let quadKey = "";

  for (let i = zoom; i > 0; i -= 1) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }

  return quadKey;
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function getCsvValue(record: string[], column: Map<string, number>, key: string): string {
  const index = column.get(key);
  return index === undefined ? "" : (record[index] ?? "").trim();
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(/* turbopackIgnore: true */ targetPath);
    return true;
  } catch {
    return false;
  }
}

function isFeature(value: unknown): value is Feature<Geometry, GeoJsonProperties> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "Feature" &&
    typeof (value as { geometry?: unknown }).geometry === "object"
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseSizeToBytes(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const multiplier = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : unit === "KB" ? 1024 : 1;

  return Number.isFinite(amount) ? amount * multiplier : 0;
}
