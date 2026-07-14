import { deflateSync } from "node:zlib";
import { parseAsciiGrid } from "./openTopography";
import type { DataProxyBbox } from "./readGeoJsonDataset";

const OPEN_TOPOGRAPHY_ENDPOINT = "https://portal.opentopography.org/API/globaldem";
const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;
const DEFAULT_TILE_SIZE = 256;
const DEFAULT_TILE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_TILE_CACHE_ENTRIES = 512;

interface TerrainRgbCacheEntry {
  buffer: Buffer;
  expiresAt: number;
  accessedAt: number;
}

interface TerrainRgbTileOptions {
  demType?: string;
  tileSize?: number;
  signal?: AbortSignal;
}

const terrainRgbTileCache = new Map<string, TerrainRgbCacheEntry>();

export async function fetchOpenTopographyTerrainRgbTile(
  z: number,
  x: number,
  y: number,
  apiKey: string,
  options: TerrainRgbTileOptions = {}
): Promise<Buffer> {
  const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
  const demType = options.demType || "COP30";
  const cacheKey = createTerrainTileCacheKey(z, x, y, demType, tileSize);
  const cachedTile = terrainRgbTileCache.get(cacheKey);

  if (cachedTile && cachedTile.expiresAt > Date.now()) {
    cachedTile.accessedAt = Date.now();
    return cachedTile.buffer;
  }

  if (cachedTile) {
    terrainRgbTileCache.delete(cacheKey);
  }

  const bbox = tileToBbox(z, x, y);
  const paddedBbox = padBbox(bbox, 0.08);
  const grid = await fetchOpenTopographyAsciiGrid(paddedBbox, apiKey, {
    ...options,
    demType,
  });
  const rgba = Buffer.alloc(tileSize * tileSize * 4);

  for (let row = 0; row < tileSize; row += 1) {
    for (let column = 0; column < tileSize; column += 1) {
      const longitude = bbox[0] + ((column + 0.5) / tileSize) * (bbox[2] - bbox[0]);
      const latitude = bbox[3] - ((row + 0.5) / tileSize) * (bbox[3] - bbox[1]);
      const elevation = sampleGridElevation(grid, longitude, latitude);
      const [red, green, blue] = encodeMapboxTerrainRgb(elevation ?? 0);
      const offset = (row * tileSize + column) * 4;

      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = 255;
    }
  }

  const tile = encodePngRgba(tileSize, tileSize, rgba);
  rememberTerrainTile(cacheKey, tile);

  return tile;
}

export function createFlatTerrainRgbTile(tileSize = DEFAULT_TILE_SIZE, elevationMeters = 0): Buffer {
  const rgba = Buffer.alloc(tileSize * tileSize * 4);
  const [red, green, blue] = encodeMapboxTerrainRgb(elevationMeters);

  for (let index = 0; index < tileSize * tileSize; index += 1) {
    const offset = index * 4;
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 255;
  }

  return encodePngRgba(tileSize, tileSize, rgba);
}

export function getTerrainRgbTileCacheStats() {
  return {
    entries: terrainRgbTileCache.size,
    maxEntries: MAX_TILE_CACHE_ENTRIES,
  };
}

export function tileToBbox(z: number, x: number, y: number): DataProxyBbox {
  const tiles = 2 ** z;
  const west = tileXToLongitude(x, tiles);
  const east = tileXToLongitude(x + 1, tiles);
  const north = tileYToLatitude(y, tiles);
  const south = tileYToLatitude(y + 1, tiles);

  return [
    clampLongitude(west),
    clampLatitude(south),
    clampLongitude(east),
    clampLatitude(north),
  ];
}

export function encodeMapboxTerrainRgb(elevationMeters: number): [number, number, number] {
  const encoded = Math.max(0, Math.min(16777215, Math.round((elevationMeters + 10000) * 10)));
  const red = Math.floor(encoded / 65536);
  const green = Math.floor((encoded - red * 65536) / 256);
  const blue = encoded - red * 65536 - green * 256;

  return [red, green, blue];
}

async function fetchOpenTopographyAsciiGrid(
  bbox: DataProxyBbox,
  apiKey: string,
  options: TerrainRgbTileOptions
): Promise<ReturnType<typeof parseAsciiGrid>> {
  const url = new URL(OPEN_TOPOGRAPHY_ENDPOINT);

  url.searchParams.set("demtype", options.demType || "COP30");
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
    cache: "force-cache",
    next: {
      revalidate: 60 * 60 * 24,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const message = (await response.text()).trim().slice(0, 300);
    throw new Error(
      `OpenTopography terrain tile failed with status ${response.status}${message ? `: ${message}` : ""}`
    );
  }

  return parseAsciiGrid(await response.text());
}

function sampleGridElevation(
  grid: ReturnType<typeof parseAsciiGrid>,
  longitude: number,
  latitude: number
): number | null {
  const gridX = (longitude - grid.xOrigin) / grid.cellSize - grid.xCenterOffset;
  const gridY = grid.nrows - (latitude - grid.yOrigin) / grid.cellSize - grid.yCenterOffset;
  const column = Math.round(gridX);
  const row = Math.round(gridY);
  const elevation = grid.values[row]?.[column];

  if (
    typeof elevation !== "number" ||
    !Number.isFinite(elevation) ||
    elevation === grid.noDataValue
  ) {
    return null;
  }

  return elevation;
}

function createTerrainTileCacheKey(
  z: number,
  x: number,
  y: number,
  demType: string,
  tileSize: number
): string {
  return `opentopography:${demType}:${tileSize}:${z}:${x}:${y}`;
}

function rememberTerrainTile(cacheKey: string, buffer: Buffer): void {
  pruneExpiredTerrainTiles();

  if (terrainRgbTileCache.size >= MAX_TILE_CACHE_ENTRIES) {
    const lruKey = findLeastRecentlyUsedTerrainTileKey();

    if (lruKey) {
      terrainRgbTileCache.delete(lruKey);
    }
  }

  terrainRgbTileCache.set(cacheKey, {
    buffer,
    expiresAt: Date.now() + DEFAULT_TILE_CACHE_TTL_MS,
    accessedAt: Date.now(),
  });
}

function pruneExpiredTerrainTiles(): void {
  const now = Date.now();

  terrainRgbTileCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      terrainRgbTileCache.delete(key);
    }
  });
}

function findLeastRecentlyUsedTerrainTileKey(): string | null {
  let lruKey: string | null = null;
  let lruAccessedAt = Number.POSITIVE_INFINITY;

  terrainRgbTileCache.forEach((entry, key) => {
    if (entry.accessedAt < lruAccessedAt) {
      lruAccessedAt = entry.accessedAt;
      lruKey = key;
    }
  });

  return lruKey;
}

function encodePngRgba(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * stride;
    const targetStart = row * (stride + 1);
    scanlines[targetStart] = 0;
    rgba.copy(scanlines, targetStart + 1, sourceStart, sourceStart + stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", createIhdr(width, height)),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return ihdr;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function tileXToLongitude(x: number, tiles: number): number {
  return (x / tiles) * 360 - 180;
}

function tileYToLatitude(y: number, tiles: number): number {
  const mercator = Math.PI * (1 - (2 * y) / tiles);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function padBbox(bbox: DataProxyBbox, ratio: number): DataProxyBbox {
  const lonPad = (bbox[2] - bbox[0]) * ratio;
  const latPad = (bbox[3] - bbox[1]) * ratio;

  return [
    clampLongitude(bbox[0] - lonPad),
    clampLatitude(bbox[1] - latPad),
    clampLongitude(bbox[2] + lonPad),
    clampLatitude(bbox[3] + latPad),
  ];
}

function clampLongitude(longitude: number): number {
  return Math.max(-180, Math.min(180, longitude));
}

function clampLatitude(latitude: number): number {
  return Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
}
