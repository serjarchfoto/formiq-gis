import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, GeoJsonProperties, Point } from "geojson";
import type { DataProxyBbox } from "./readGeoJsonDataset";

const OPEN_TOPOGRAPHY_ENDPOINT = "https://portal.opentopography.org/API/globaldem";
const DEFAULT_DEM_TYPE = "COP30";
const DEFAULT_MAX_SAMPLES = 4096;

export interface OpenTopographyResult {
  features: Array<Feature<Point, GeoJsonProperties>>;
  demType: string;
  sourceRows: number;
  sourceColumns: number;
  sampleStride: number;
  cacheHits?: number;
  cacheMisses?: number;
}

export async function fetchOpenTopographyDem(
  bbox: DataProxyBbox,
  apiKey: string,
  options: {
    demType?: string;
    maxSamples?: number;
    signal?: AbortSignal;
  } = {}
): Promise<OpenTopographyResult> {
  if (shouldSplitBbox(bbox)) {
    return fetchOpenTopographyDemParts(bbox, apiKey, options);
  }

  return fetchOpenTopographyDemPart(bbox, apiKey, options);
}

async function fetchOpenTopographyDemParts(
  bbox: DataProxyBbox,
  apiKey: string,
  options: {
    demType?: string;
    maxSamples?: number;
    signal?: AbortSignal;
  }
): Promise<OpenTopographyResult> {
  const parts = splitBboxIntoQuadrants(bbox);
  const maxSamplesPerPart = Math.max(
    1,
    Math.ceil((options.maxSamples ?? DEFAULT_MAX_SAMPLES) / parts.length)
  );
  const results = await Promise.allSettled(
    parts.map((part) =>
      fetchOpenTopographyDemPart(part, apiKey, {
        ...options,
        maxSamples: maxSamplesPerPart,
      })
    )
  );
  const successful = results
    .filter((result): result is PromiseFulfilledResult<OpenTopographyResult> => result.status === "fulfilled")
    .map((result) => result.value);

  if (!successful.length) {
    const firstError = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new Error("OpenTopography DEM request failed for all bbox parts.");
  }

  return {
    features: successful.flatMap((result) => result.features),
    demType: successful[0]?.demType ?? options.demType ?? DEFAULT_DEM_TYPE,
    sourceRows: successful.reduce((total, result) => total + result.sourceRows, 0),
    sourceColumns: Math.max(...successful.map((result) => result.sourceColumns)),
    sampleStride: Math.max(...successful.map((result) => result.sampleStride)),
    cacheHits: successful.reduce((total, result) => total + (result.cacheHits ?? 0), 0),
    cacheMisses: successful.reduce((total, result) => total + (result.cacheMisses ?? 0), 0),
  };
}

async function fetchOpenTopographyDemPart(
  bbox: DataProxyBbox,
  apiKey: string,
  options: {
    demType?: string;
    maxSamples?: number;
    signal?: AbortSignal;
  }
): Promise<OpenTopographyResult> {
  const demType = options.demType || DEFAULT_DEM_TYPE;
  const maxSamples = Math.max(1, options.maxSamples ?? DEFAULT_MAX_SAMPLES);
  const cacheKey = createOpenTopographyCacheKey(bbox, demType, maxSamples);
  const cached = await readOpenTopographyCache(cacheKey);

  if (cached) {
    return {
      ...cached,
      cacheHits: 1,
      cacheMisses: 0,
    };
  }

  const url = new URL(OPEN_TOPOGRAPHY_ENDPOINT);

  url.searchParams.set("demtype", demType);
  url.searchParams.set("south", String(bbox[1]));
  url.searchParams.set("north", String(bbox[3]));
  url.searchParams.set("west", String(bbox[0]));
  url.searchParams.set("east", String(bbox[2]));
  url.searchParams.set("outputFormat", "AAIGrid");
  url.searchParams.set("API_Key", apiKey);

  const response = await fetch(url, {
    headers: {
      Accept: "text/plain, application/octet-stream",
    },
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    const message = (await response.text()).trim().slice(0, 300);
    throw new Error(
      `OpenTopography request failed with status ${response.status}${message ? `: ${message}` : ""}`
    );
  }

  const grid = parseAsciiGrid(await response.text());
  const sampleStride = Math.max(1, Math.ceil(Math.sqrt((grid.ncols * grid.nrows) / maxSamples)));
  const features: Array<Feature<Point, GeoJsonProperties>> = [];

  for (let row = 0; row < grid.nrows; row += sampleStride) {
    for (let column = 0; column < grid.ncols; column += sampleStride) {
      const elevation = grid.values[row]?.[column];

      if (
        typeof elevation !== "number" ||
        !Number.isFinite(elevation) ||
        elevation === grid.noDataValue
      ) {
        continue;
      }

      const longitude = grid.xOrigin + (column + grid.xCenterOffset) * grid.cellSize;
      const latitude =
        grid.yOrigin + (grid.nrows - row - grid.yCenterOffset) * grid.cellSize;

      features.push({
        type: "Feature",
        id: `opentopography-${row}-${column}`,
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        properties: {
          category: "terrain",
          elevation,
          demType,
          source: "open-topography",
          gridRow: row,
          gridColumn: column,
        },
      });
    }
  }

  const result: OpenTopographyResult = {
    features,
    demType,
    sourceRows: grid.nrows,
    sourceColumns: grid.ncols,
    sampleStride,
    cacheHits: 0,
    cacheMisses: 1,
  };

  await writeOpenTopographyCache(cacheKey, result);

  return result;
}

function shouldSplitBbox(bbox: DataProxyBbox): boolean {
  if (process.env.OPEN_TOPOGRAPHY_SPLIT_LARGE_REQUESTS !== "1") {
    return false;
  }

  const width = Math.abs(bbox[2] - bbox[0]);
  const height = Math.abs(bbox[3] - bbox[1]);

  return width > 0.08 || height > 0.08;
}

function splitBboxIntoQuadrants(bbox: DataProxyBbox): DataProxyBbox[] {
  const [west, south, east, north] = bbox;
  const centerLongitude = (west + east) / 2;
  const centerLatitude = (south + north) / 2;

  return [
    [west, south, centerLongitude, centerLatitude],
    [centerLongitude, south, east, centerLatitude],
    [west, centerLatitude, centerLongitude, north],
    [centerLongitude, centerLatitude, east, north],
  ];
}

async function readOpenTopographyCache(cacheKey: string): Promise<OpenTopographyResult | null> {
  if (process.env.OPEN_TOPOGRAPHY_CACHE_DISABLED === "1") {
    return null;
  }

  const filePath = getOpenTopographyCachePath(cacheKey);

  try {
    await access(/* turbopackIgnore: true */ filePath);
    return JSON.parse(await readFile(/* turbopackIgnore: true */ filePath, "utf8")) as OpenTopographyResult;
  } catch {
    return null;
  }
}

async function writeOpenTopographyCache(cacheKey: string, result: OpenTopographyResult): Promise<void> {
  if (process.env.OPEN_TOPOGRAPHY_CACHE_DISABLED === "1") {
    return;
  }

  const filePath = getOpenTopographyCachePath(cacheKey);

  await mkdir(/* turbopackIgnore: true */ path.dirname(filePath), { recursive: true });
  await writeFile(
    /* turbopackIgnore: true */ filePath,
    JSON.stringify(
      {
        ...result,
        cacheHits: 0,
        cacheMisses: 0,
      },
      null,
      0
    )
  );
}

function createOpenTopographyCacheKey(bbox: DataProxyBbox, demType: string, maxSamples: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        bbox: bbox.map((value) => Number(value.toFixed(7))),
        demType,
        maxSamples,
        version: "opentopography-dem-v2",
      })
    )
    .digest("hex");
}

function getOpenTopographyCachePath(cacheKey: string): string {
  const cacheRoot = process.env.OPEN_TOPOGRAPHY_CACHE_PATH?.trim()
    ? path.resolve(/* turbopackIgnore: true */ process.env.OPEN_TOPOGRAPHY_CACHE_PATH)
    : path.join(
        /* turbopackIgnore: true */ process.env.VERCEL ? "/tmp" : process.cwd(),
        "formiq/opentopography"
      );

  return path.join(cacheRoot, `${cacheKey}.json`);
}

export function parseAsciiGrid(input: string) {
  const lines = input
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = new Map<string, number>();
  let dataStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const [rawKey, rawValue] = lines[index].split(/\s+/, 2);
    const key = rawKey.toLowerCase();

    if (!isAsciiGridHeaderKey(key)) {
      dataStart = index;
      break;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid AAIGrid header value for ${rawKey}.`);
    }
    header.set(key, value);
    dataStart = index + 1;
  }

  const ncols = getRequiredHeader(header, "ncols");
  const nrows = getRequiredHeader(header, "nrows");
  const cellSize = getRequiredHeader(header, "cellsize");
  const usesXCenter = header.has("xllcenter");
  const usesYCenter = header.has("yllcenter");
  const xOrigin = header.get(usesXCenter ? "xllcenter" : "xllcorner");
  const yOrigin = header.get(usesYCenter ? "yllcenter" : "yllcorner");

  if (typeof xOrigin !== "number" || typeof yOrigin !== "number") {
    throw new Error("AAIGrid origin is missing.");
  }

  const values = lines.slice(dataStart).map((line) =>
    line.split(/\s+/).map((value) => Number(value))
  );

  if (values.length !== nrows || values.some((row) => row.length !== ncols)) {
    throw new Error("AAIGrid dimensions do not match its header.");
  }

  return {
    ncols,
    nrows,
    cellSize,
    xOrigin,
    yOrigin,
    xCenterOffset: usesXCenter ? 0 : 0.5,
    yCenterOffset: usesYCenter ? 1 : 0.5,
    noDataValue: header.get("nodata_value") ?? -9999,
    values,
  };
}

function isAsciiGridHeaderKey(key: string): boolean {
  return [
    "ncols",
    "nrows",
    "xllcorner",
    "yllcorner",
    "xllcenter",
    "yllcenter",
    "cellsize",
    "nodata_value",
  ].includes(key);
}

function getRequiredHeader(header: Map<string, number>, key: string): number {
  const value = header.get(key);

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AAIGrid header ${key} is missing or invalid.`);
  }

  return value;
}
