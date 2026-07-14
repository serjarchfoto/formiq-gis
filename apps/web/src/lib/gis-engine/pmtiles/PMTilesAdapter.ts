import type { Feature, GeoJsonProperties, Geometry, Position } from "geojson";
import type { BoundingBox } from "@/types/gis";
import { normalizeGeneralGeoJsonFeature } from "@/lib/gis-engine/fusion/providers/GeoJsonProxySourceAdapter";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { LocalTileCache } from "./LocalTileCache";
import type { OfflineTileSource, PMTilesAdapter as IPMTilesAdapter, PMTilesMetadata, TileCoordinate, TilePayload } from "./types";

const HEADER_SIZE_BYTES = 127;
const INITIAL_READ_BYTES = 16_384;

const enum Compression {
  Unknown = 0,
  None = 1,
  Gzip = 2,
  Brotli = 3,
  Zstd = 4,
}

const enum PMTileType {
  Unknown = 0,
  Mvt = 1,
  Png = 2,
  Jpeg = 3,
  Webp = 4,
  Avif = 5,
  Mlt = 6,
}

interface PMTilesHeader {
  specVersion: number;
  rootDirectoryOffset: number;
  rootDirectoryLength: number;
  jsonMetadataOffset: number;
  jsonMetadataLength: number;
  leafDirectoryOffset: number;
  tileDataOffset: number;
  internalCompression: Compression;
  tileCompression: Compression;
  tileType: PMTileType;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
  etag?: string;
}

interface DirectoryEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

interface LoadedArchive {
  header: PMTilesHeader;
  metadata: PMTilesMetadata;
  rootDirectory: DirectoryEntry[];
}

interface RangeResponse {
  bytes: ArrayBuffer;
  etag?: string;
}

interface DecodedTileFeatures {
  coordinate: TileCoordinate;
  features: SourceFeature[];
}

interface VectorTileLayer {
  name: string;
  version: number;
  extent: number;
  keys: string[];
  values: unknown[];
  features: VectorTileRawFeature[];
}

interface VectorTileRawFeature {
  id?: string | number;
  tags: number[];
  type: number;
  geometry: number[];
}

export class PMTilesAdapter implements IPMTilesAdapter {
  private readonly tileCache = new LocalTileCache<TilePayload>(1024, 30 * 60 * 1000);
  private readonly decodedFeatureCache = new LocalTileCache<DecodedTileFeatures>(512, 30 * 60 * 1000);
  private readonly archiveCache = new Map<string, Promise<LoadedArchive>>();
  private readonly directoryCache = new Map<string, Promise<DirectoryEntry[]>>();

  async readMetadata(source: OfflineTileSource): Promise<PMTilesMetadata> {
    const archive = await this.loadArchive(source);
    return archive.metadata;
  }

  async getTile(source: OfflineTileSource, coordinate: TileCoordinate): Promise<TilePayload | null> {
    const key = `${this.sourceKey(source)}:${coordinate.z}:${coordinate.x}:${coordinate.y}`;
    const cached = this.tileCache.get(key);
    if (cached) return cached;

    const archive = await this.loadArchive(source);
    const tileId = zxyToTileId(coordinate.z, coordinate.x, coordinate.y);
    const entry = await this.findTileEntry(source, archive, tileId);
    if (!entry || entry.runLength === 0) return null;

    const bytes = await this.readRange(source, archive.header.tileDataOffset + entry.offset, entry.length, archive.header.etag);
    const payload: TilePayload = {
      coordinate,
      contentType: contentTypeForTileType(archive.header.tileType),
      data: new Uint8Array(await decompress(bytes.bytes, archive.header.tileCompression)),
    };
    this.tileCache.set(key, payload);
    return payload;
  }

  async queryFeatures(source: OfflineTileSource, bbox: BoundingBox) {
    return toFeatureCollection(await this.querySourceFeatures(source, bbox));
  }

  async querySourceFeatures(source: OfflineTileSource, bbox: BoundingBox): Promise<SourceFeature[]> {
    const metadata = await this.readMetadata(source);
    if (metadata.tileType !== "mvt") return [];

    const zoom = selectQueryZoom(metadata);
    const coordinates = getTileCoordinatesForBbox(bbox, zoom);
    const decodedTiles = await Promise.all(coordinates.map((coordinate) => this.decodeTileFeatures(source, coordinate)));

    return decodedTiles
      .flatMap((tile) => tile.features)
      .filter((feature) => geometryIntersectsBbox(feature.geometry, bbox));
  }

  get cacheSize(): number {
    return this.tileCache.size;
  }

  get decodedCacheSize(): number {
    return this.decodedFeatureCache.size;
  }

  private async decodeTileFeatures(source: OfflineTileSource, coordinate: TileCoordinate): Promise<DecodedTileFeatures> {
    const key = `${this.sourceKey(source)}:decoded:${coordinate.z}:${coordinate.x}:${coordinate.y}`;
    const cached = this.decodedFeatureCache.get(key);
    if (cached) return cached;

    const tile = await this.getTile(source, coordinate);
    const decoded: DecodedTileFeatures = {
      coordinate,
      features: tile?.contentType === "application/vnd.mapbox-vector-tile"
        ? decodeMvt(tile.data, coordinate).flatMap((feature, index) =>
            normalizeGeneralGeoJsonFeature("pmtiles", feature, index, `pmtiles-${source.id}-${coordinate.z}-${coordinate.x}-${coordinate.y}`)
          )
        : [],
    };

    this.decodedFeatureCache.set(key, decoded);
    return decoded;
  }

  private async findTileEntry(source: OfflineTileSource, archive: LoadedArchive, tileId: number): Promise<DirectoryEntry | null> {
    const rootEntry = findTile(archive.rootDirectory, tileId);
    if (!rootEntry) return null;
    if (rootEntry.runLength > 0) return rootEntry;

    const directory = await this.readDirectory(
      source,
      archive,
      archive.header.leafDirectoryOffset + rootEntry.offset,
      rootEntry.length,
    );
    const leafEntry = findTile(directory, tileId);
    return leafEntry && leafEntry.runLength > 0 ? leafEntry : null;
  }

  private loadArchive(source: OfflineTileSource): Promise<LoadedArchive> {
    const key = this.sourceKey(source);
    const existing = this.archiveCache.get(key);
    if (existing) return existing;

    const loading = this.loadArchiveUncached(source);
    this.archiveCache.set(key, loading);
    return loading;
  }

  private async loadArchiveUncached(source: OfflineTileSource): Promise<LoadedArchive> {
    const initial = await this.readRange(source, 0, INITIAL_READ_BYTES);
    const headerBytes = initial.bytes.slice(0, HEADER_SIZE_BYTES);
    const header = parseHeader(headerBytes, initial.etag);

    const rootDirectoryBytes = await this.readArchiveSection(source, initial, header.rootDirectoryOffset, header.rootDirectoryLength, header.etag);
    const rootDirectory = parseDirectory(await decompress(rootDirectoryBytes, header.internalCompression));
    if (rootDirectory.length === 0) throw new Error("Invalid PMTiles archive: root directory is empty");

    const metadataBytes = header.jsonMetadataLength > 0
      ? await this.readArchiveSection(source, initial, header.jsonMetadataOffset, header.jsonMetadataLength, header.etag)
      : new ArrayBuffer(0);
    const metadataJson = metadataBytes.byteLength > 0
      ? parseMetadataJson(await decompress(metadataBytes, header.internalCompression))
      : {};

    return {
      header,
      rootDirectory,
      metadata: buildMetadata(source, header, metadataJson),
    };
  }

  private async readDirectory(
    source: OfflineTileSource,
    archive: LoadedArchive,
    offset: number,
    length: number,
  ): Promise<DirectoryEntry[]> {
    const key = `${this.sourceKey(source)}:${offset}:${length}`;
    const existing = this.directoryCache.get(key);
    if (existing) return existing;

    const loading = this.readRange(source, offset, length, archive.header.etag)
      .then((response) => decompress(response.bytes, archive.header.internalCompression))
      .then(parseDirectory);
    this.directoryCache.set(key, loading);
    return loading;
  }

  private async readArchiveSection(
    source: OfflineTileSource,
    initial: RangeResponse,
    offset: number,
    length: number,
    etag?: string,
  ): Promise<ArrayBuffer> {
    if (offset + length <= initial.bytes.byteLength) {
      return initial.bytes.slice(offset, offset + length);
    }
    const response = await this.readRange(source, offset, length, etag);
    return response.bytes;
  }

  private async readRange(source: OfflineTileSource, offset: number, length: number, etag?: string): Promise<RangeResponse> {
    if (length < 0) throw new Error("PMTiles range length must be non-negative");

    if (source.bytes) {
      const bytes = source.bytes instanceof Uint8Array
        ? source.bytes.slice(offset, offset + length)
        : new Uint8Array(source.bytes.slice(offset, offset + length));
      return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }

    if (source.file) {
      return { bytes: await source.file.slice(offset, offset + length).arrayBuffer() };
    }

    if (!source.url) {
      throw new Error("PMTiles source requires url, file, or bytes");
    }

    const response = await fetch(source.url, {
      headers: {
        Range: `bytes=${offset}-${offset + length - 1}`,
        ...(etag ? { "If-Match": etag } : {}),
      },
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to read PMTiles range ${offset}-${offset + length - 1}: ${response.status}`);
    }
    return {
      bytes: await response.arrayBuffer(),
      etag: response.headers.get("etag") ?? undefined,
    };
  }

  private sourceKey(source: OfflineTileSource): string {
    if (source.url) return source.url;
    if (source.file) return `${source.id}:${source.file.size}:${source.file.type}`;
    if (source.bytes) return `${source.id}:${source.bytes.byteLength}`;
    return source.id;
  }
}

export class PlaceholderPMTilesAdapter extends PMTilesAdapter {}

export function createPMTilesSource(
  id: string,
  name: string,
  url: string,
  bounds: BoundingBox | null = null,
  bytes?: ArrayBuffer | Uint8Array,
): OfflineTileSource {
  return {
    id,
    url,
    bytes,
    metadata: {
      id,
      name,
      minZoom: 0,
      maxZoom: 14,
      bounds,
      tileType: "mvt",
      vectorLayers: [],
    },
  };
}

export function createPMTilesFileSource(id: string, file: Blob, name = id): OfflineTileSource {
  return {
    id,
    file,
    metadata: {
      id,
      name,
      minZoom: 0,
      maxZoom: 0,
      bounds: null,
      tileType: "unknown",
      vectorLayers: [],
    },
  };
}

function parseHeader(buffer: ArrayBuffer, etag?: string): PMTilesHeader {
  const view = new DataView(buffer);
  if (view.getUint16(0, true) !== 0x4d50) {
    throw new Error("Wrong magic number for PMTiles archive");
  }

  const specVersion = view.getUint8(7);
  if (specVersion !== 3) {
    throw new Error(`Unsupported PMTiles spec version ${specVersion}`);
  }

  return {
    specVersion,
    rootDirectoryOffset: getUint64(view, 8),
    rootDirectoryLength: getUint64(view, 16),
    jsonMetadataOffset: getUint64(view, 24),
    jsonMetadataLength: getUint64(view, 32),
    leafDirectoryOffset: getUint64(view, 40),
    tileDataOffset: getUint64(view, 56),
    internalCompression: view.getUint8(97),
    tileCompression: view.getUint8(98),
    tileType: view.getUint8(99),
    minZoom: view.getUint8(100),
    maxZoom: view.getUint8(101),
    minLon: view.getInt32(102, true) / 10_000_000,
    minLat: view.getInt32(106, true) / 10_000_000,
    maxLon: view.getInt32(110, true) / 10_000_000,
    maxLat: view.getInt32(114, true) / 10_000_000,
    centerZoom: view.getUint8(118),
    centerLon: view.getInt32(119, true) / 10_000_000,
    centerLat: view.getInt32(123, true) / 10_000_000,
    etag,
  };
}

function getUint64(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 2 ** 32 + low;
}

function parseDirectory(buffer: ArrayBuffer): DirectoryEntry[] {
  const state = { bytes: new Uint8Array(buffer), position: 0 };
  const entryCount = readVarint(state);
  const entries: DirectoryEntry[] = [];

  let lastTileId = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const delta = readVarint(state);
    lastTileId += delta;
    entries.push({ tileId: lastTileId, offset: 0, length: 0, runLength: 1 });
  }

  for (let index = 0; index < entryCount; index += 1) {
    entries[index].runLength = readVarint(state);
  }

  for (let index = 0; index < entryCount; index += 1) {
    entries[index].length = readVarint(state);
  }

  for (let index = 0; index < entryCount; index += 1) {
    const encodedOffset = readVarint(state);
    entries[index].offset = encodedOffset === 0 && index > 0
      ? entries[index - 1].offset + entries[index - 1].length
      : encodedOffset - 1;
  }

  return entries;
}

function readVarint(state: { bytes: Uint8Array; position: number }): number {
  let shift = 0;
  let result = 0;

  while (state.position < state.bytes.length) {
    const byte = state.bytes[state.position++];
    result += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return result;
    shift += 7;
  }

  throw new Error("Unexpected end of PMTiles varint");
}

function findTile(entries: DirectoryEntry[], tileId: number): DirectoryEntry | null {
  let low = 0;
  let high = entries.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const current = entries[middle];
    if (tileId === current.tileId) return current;
    if (tileId > current.tileId) low = middle + 1;
    else high = middle - 1;
  }

  const previous = entries[high];
  if (!previous) return null;
  if (previous.runLength === 0) return previous;
  return tileId - previous.tileId < previous.runLength ? previous : null;
}

function zxyToTileId(z: number, x: number, y: number): number {
  if (z < 0 || z > 26) throw new Error("PMTiles zoom must be between 0 and 26");
  const size = 1 << z;
  if (x < 0 || y < 0 || x >= size || y >= size) {
    throw new Error("PMTiles tile coordinate is outside zoom bounds");
  }

  let accumulator = (size * size - 1) / 3;
  let tx = x;
  let ty = y;
  for (let scale = size >> 1; scale > 0; scale >>= 1) {
    const rx = (tx & scale) > 0 ? 1 : 0;
    const ry = (ty & scale) > 0 ? 1 : 0;
    accumulator += scale * scale * ((3 * rx) ^ ry);
    [tx, ty] = rotateHilbert(scale, tx, ty, rx, ry);
  }
  return accumulator;
}

function rotateHilbert(size: number, x: number, y: number, rx: number, ry: number): [number, number] {
  if (ry !== 0) return [x, y];
  if (rx !== 0) return [size - 1 - y, size - 1 - x];
  return [y, x];
}

async function decompress(buffer: ArrayBuffer, compression: Compression): Promise<ArrayBuffer> {
  if (compression === Compression.None || compression === Compression.Unknown) return buffer;

  if (compression === Compression.Gzip) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Gzip-compressed PMTiles archives require DecompressionStream support in this runtime");
    }
    const stream = new Response(buffer).body;
    if (!stream) throw new Error("Failed to create PMTiles decompression stream");
    return new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }

  throw new Error(`Unsupported PMTiles compression ${compression}`);
}

function parseMetadataJson(buffer: ArrayBuffer): Record<string, unknown> {
  const json = new TextDecoder().decode(buffer).trim();
  if (!json) return {};
  const parsed = JSON.parse(json);
  return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
}

function buildMetadata(source: OfflineTileSource, header: PMTilesHeader, json: Record<string, unknown>): PMTilesMetadata {
  const vectorLayers = Array.isArray(json.vector_layers)
    ? json.vector_layers
      .map((layer) => typeof layer === "object" && layer !== null && "id" in layer ? String((layer as { id: unknown }).id) : null)
      .filter((layer): layer is string => Boolean(layer))
    : [];

  return {
    id: source.id,
    name: typeof json.name === "string" ? json.name : source.metadata?.name ?? source.id,
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    bounds: {
      west: header.minLon,
      south: header.minLat,
      east: header.maxLon,
      north: header.maxLat,
    },
    tileType: mapTileType(header.tileType),
    vectorLayers,
    attribution: typeof json.attribution === "string" ? json.attribution : undefined,
    description: typeof json.description === "string" ? json.description : undefined,
    center: [header.centerLon, header.centerLat, header.centerZoom],
  };
}

function mapTileType(tileType: PMTileType): PMTilesMetadata["tileType"] {
  if (tileType === PMTileType.Mvt) return "mvt";
  if (tileType === PMTileType.Png) return "png";
  if (tileType === PMTileType.Jpeg) return "jpg";
  if (tileType === PMTileType.Webp) return "webp";
  if (tileType === PMTileType.Avif) return "avif";
  if (tileType === PMTileType.Mlt) return "mlt";
  return "unknown";
}

function contentTypeForTileType(tileType: PMTileType): string {
  if (tileType === PMTileType.Mvt) return "application/vnd.mapbox-vector-tile";
  if (tileType === PMTileType.Png) return "image/png";
  if (tileType === PMTileType.Jpeg) return "image/jpeg";
  if (tileType === PMTileType.Webp) return "image/webp";
  if (tileType === PMTileType.Avif) return "image/avif";
  if (tileType === PMTileType.Mlt) return "application/vnd.mapbox-vector-tile";
  return "application/octet-stream";
}

function decodeMvt(data: Uint8Array, coordinate: TileCoordinate): Array<Feature<Geometry, GeoJsonProperties>> {
  return readVectorTile(data)
    .flatMap((layer) => layer.features.map((feature, index) => decodeMvtFeature(layer, feature, coordinate, index)))
    .filter((feature): feature is Feature<Geometry, GeoJsonProperties> => feature !== null);
}

function readVectorTile(data: Uint8Array): VectorTileLayer[] {
  const reader = new ProtobufReader(data);
  const layers: VectorTileLayer[] = [];

  while (!reader.done) {
    const field = reader.readField();
    if (field.number === 3 && field.wireType === 2) {
      layers.push(readLayer(reader.readBytes()));
    } else {
      reader.skip(field.wireType);
    }
  }

  return layers;
}

function readLayer(data: Uint8Array): VectorTileLayer {
  const reader = new ProtobufReader(data);
  const layer: VectorTileLayer = {
    name: "",
    version: 1,
    extent: 4096,
    keys: [],
    values: [],
    features: [],
  };

  while (!reader.done) {
    const field = reader.readField();
    if (field.number === 1 && field.wireType === 2) layer.name = reader.readString();
    else if (field.number === 2 && field.wireType === 2) layer.features.push(readFeature(reader.readBytes()));
    else if (field.number === 3 && field.wireType === 2) layer.keys.push(reader.readString());
    else if (field.number === 4 && field.wireType === 2) layer.values.push(readValue(reader.readBytes()));
    else if (field.number === 5 && field.wireType === 0) layer.extent = reader.readVarint();
    else if (field.number === 15 && field.wireType === 0) layer.version = reader.readVarint();
    else reader.skip(field.wireType);
  }

  return layer;
}

function readFeature(data: Uint8Array): VectorTileRawFeature {
  const reader = new ProtobufReader(data);
  const feature: VectorTileRawFeature = { tags: [], type: 0, geometry: [] };

  while (!reader.done) {
    const field = reader.readField();
    if (field.number === 1 && field.wireType === 0) feature.id = reader.readVarint();
    else if (field.number === 2 && field.wireType === 2) feature.tags = readPackedVarints(reader.readBytes());
    else if (field.number === 3 && field.wireType === 0) feature.type = reader.readVarint();
    else if (field.number === 4 && field.wireType === 2) feature.geometry = readPackedVarints(reader.readBytes());
    else reader.skip(field.wireType);
  }

  return feature;
}

function readValue(data: Uint8Array): unknown {
  const reader = new ProtobufReader(data);
  let value: unknown = null;

  while (!reader.done) {
    const field = reader.readField();
    if (field.number === 1 && field.wireType === 2) value = reader.readString();
    else if (field.number === 2 && field.wireType === 5) value = reader.readFloat32();
    else if (field.number === 3 && field.wireType === 1) value = reader.readFloat64();
    else if (field.number === 4 && field.wireType === 0) value = reader.readVarint();
    else if (field.number === 5 && field.wireType === 0) value = reader.readVarint();
    else if (field.number === 6 && field.wireType === 0) value = zigZagDecode(reader.readVarint());
    else if (field.number === 7 && field.wireType === 0) value = reader.readVarint() === 1;
    else reader.skip(field.wireType);
  }

  return value;
}

function readPackedVarints(data: Uint8Array): number[] {
  const reader = new ProtobufReader(data);
  const values: number[] = [];
  while (!reader.done) values.push(reader.readVarint());
  return values;
}

function decodeMvtFeature(
  layer: VectorTileLayer,
  feature: VectorTileRawFeature,
  coordinate: TileCoordinate,
  index: number,
): Feature<Geometry, GeoJsonProperties> | null {
  const geometry = decodeMvtGeometry(feature, layer.extent, coordinate);
  if (!geometry) return null;

  return {
    type: "Feature",
    id: feature.id ?? `${layer.name}-${index}`,
    geometry,
    properties: {
      ...decodeProperties(layer, feature.tags),
      layer: layer.name,
      "_formiq:mvtLayer": layer.name,
    },
  };
}

function decodeProperties(layer: VectorTileLayer, tags: number[]): GeoJsonProperties {
  const properties: Record<string, unknown> = {};
  for (let index = 0; index < tags.length - 1; index += 2) {
    const key = layer.keys[tags[index]];
    if (!key) continue;
    properties[key] = layer.values[tags[index + 1]];
  }
  return properties as GeoJsonProperties;
}

function decodeMvtGeometry(feature: VectorTileRawFeature, extent: number, tile: TileCoordinate): Geometry | null {
  const paths = readMvtPaths(feature.geometry, extent, tile);
  if (paths.length === 0) return null;

  if (feature.type === 1) {
    const points = paths.flatMap((path) => path);
    if (points.length === 1) return { type: "Point", coordinates: points[0] };
    return { type: "MultiPoint", coordinates: points };
  }

  if (feature.type === 2) {
    const lines = paths.filter((path) => path.length >= 2);
    if (lines.length === 0) return null;
    if (lines.length === 1) return { type: "LineString", coordinates: lines[0] };
    return { type: "MultiLineString", coordinates: lines };
  }

  if (feature.type === 3) {
    const polygons = assemblePolygons(paths);
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
    return { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
}

function readMvtPaths(commands: number[], extent: number, tile: TileCoordinate): Position[][] {
  const paths: Position[][] = [];
  let path: Position[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let index = 0;

  while (index < commands.length) {
    const command = commands[index++];
    const id = command & 0x7;
    const count = command >> 3;

    if (id === 1 || id === 2) {
      for (let step = 0; step < count && index + 1 < commands.length; step += 1) {
        cursorX += zigZagDecode(commands[index++]);
        cursorY += zigZagDecode(commands[index++]);
        const position = tilePointToLonLat(cursorX, cursorY, extent, tile);
        if (id === 1) {
          if (path.length > 0) paths.push(path);
          path = [position];
        } else {
          path.push(position);
        }
      }
    } else if (id === 7) {
      if (path.length > 0) {
        path = closeRing(path);
        paths.push(path);
        path = [];
      }
    }
  }

  if (path.length > 0) paths.push(path);
  return paths;
}

function assemblePolygons(rings: Position[][]): Position[][][] {
  const polygons: Position[][][] = [];

  for (const ring of rings.filter((candidate) => candidate.length >= 4)) {
    if (signedRingArea(ring) < 0 || polygons.length === 0) {
      polygons.push([ring]);
    } else {
      polygons[polygons.length - 1].push(ring);
    }
  }

  return polygons;
}

function tilePointToLonLat(x: number, y: number, extent: number, tile: TileCoordinate): Position {
  const scale = 2 ** tile.z;
  const normalizedX = (tile.x + x / extent) / scale;
  const normalizedY = (tile.y + y / extent) / scale;
  const longitude = normalizedX * 360 - 180;
  const latitude = radiansToDegrees(Math.atan(Math.sinh(Math.PI * (1 - 2 * normalizedY))));
  return [longitude, latitude];
}

function closeRing(ring: Position[]): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) return ring;
  return [...ring, first];
}

function signedRingArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function toFeatureCollection(features: SourceFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map<Feature<Geometry, GeoJsonProperties>>((feature) => ({
      type: "Feature",
      id: feature.sourceFeatureId,
      geometry: feature.geometry,
      properties: {
        ...sourceFeatureProperties(feature),
        "_formiq:source": feature.source,
        "_formiq:kind": feature.kind,
        "_formiq:sourceFeatureId": feature.sourceFeatureId,
      },
    })),
  };
}

function sourceFeatureProperties(feature: SourceFeature): GeoJsonProperties {
  const properties: Record<string, string | number | boolean | null> = { ...feature.tags };
  for (const key of ["height", "levels", "year", "usage", "material", "roof", "addressLabel", "objectType", "roadType", "surface", "lanes", "vegetationType", "waterType", "adminLevel", "name", "category", "subtype", "network", "stopType", "elevation", "slope"] as const) {
    if (key in feature) {
      const value = feature[key as keyof SourceFeature];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        properties[key] = value;
      }
    }
  }
  return properties;
}

function selectQueryZoom(metadata: PMTilesMetadata): number {
  return Math.max(metadata.minZoom, Math.min(metadata.maxZoom, 14));
}

function getTileCoordinatesForBbox(bbox: BoundingBox, zoom: number): TileCoordinate[] {
  const max = 2 ** zoom - 1;
  const west = clampLongitude(bbox.west);
  const east = clampLongitude(bbox.east);
  const north = clampLatitude(bbox.north);
  const south = clampLatitude(bbox.south);
  const minX = clampInteger(lonToTileX(west, zoom), 0, max);
  const maxX = clampInteger(lonToTileX(east, zoom), 0, max);
  const minY = clampInteger(latToTileY(north, zoom), 0, max);
  const maxY = clampInteger(latToTileY(south, zoom), 0, max);
  const coordinates: TileCoordinate[] = [];

  for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x += 1) {
    for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y += 1) {
      coordinates.push({ z: zoom, x, y });
    }
  }

  return coordinates;
}

function geometryIntersectsBbox(geometry: Geometry, bbox: BoundingBox): boolean {
  const bounds = geometryBounds(geometry);
  if (!bounds) return false;
  return bounds.east >= bbox.west && bounds.west <= bbox.east && bounds.north >= bbox.south && bounds.south <= bbox.north;
}

function geometryBounds(geometry: Geometry): BoundingBox | null {
  const positions = collectPositions(geometry);
  if (positions.length === 0) return null;
  return positions.reduce<BoundingBox>((bounds, position) => ({
    west: Math.min(bounds.west, position[0]),
    south: Math.min(bounds.south, position[1]),
    east: Math.max(bounds.east, position[0]),
    north: Math.max(bounds.north, position[1]),
  }), { west: Number.POSITIVE_INFINITY, south: Number.POSITIVE_INFINITY, east: Number.NEGATIVE_INFINITY, north: Number.NEGATIVE_INFINITY });
}

function collectPositions(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "MultiPoint" || geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const radians = degreesToRadians(lat);
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom);
}

function clampLongitude(value: number): number {
  return Math.max(-180, Math.min(180, value));
}

function clampLatitude(value: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function zigZagDecode(value: number): number {
  return (value >> 1) ^ (-(value & 1));
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

class ProtobufReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.position >= this.bytes.length;
  }

  readField(): { number: number; wireType: number } {
    const tag = this.readVarint();
    return { number: tag >> 3, wireType: tag & 0x7 };
  }

  readVarint(): number {
    let shift = 0;
    let result = 0;

    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position++];
      result += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return result;
      shift += 7;
    }

    throw new Error("Unexpected end of MVT varint");
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    const start = this.position;
    this.position += length;
    return this.bytes.slice(start, this.position);
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }

  readFloat32(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.position, 4).getFloat32(0, true);
    this.position += 4;
    return value;
  }

  readFloat64(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.position, 8).getFloat64(0, true);
    this.position += 8;
    return value;
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint();
    } else if (wireType === 1) {
      this.position += 8;
    } else if (wireType === 2) {
      this.position += this.readVarint();
    } else if (wireType === 5) {
      this.position += 4;
    } else {
      throw new Error(`Unsupported MVT protobuf wire type ${wireType}`);
    }
  }
}
