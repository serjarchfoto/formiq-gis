import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Point, Position } from "geojson";
import type { SpatialImportAdapter, SpatialImportFormat, SpatialImportRequest } from "./types";
import {
  createUnsupportedDataset,
  createVectorLayer,
  createVectorDataset,
  getPayloadText,
  isFeatureCollection,
  normalizeFeatureCollection,
} from "./spatialImportUtils";

export class GeoJsonImportAdapter implements SpatialImportAdapter {
  readonly format = "geojson" as const;
  readonly label = "GeoJSON";
  readonly futureGdalDriver = "GeoJSON";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    if (isFeatureCollection(request.payload)) {
      return createVectorDataset(request, this.label, normalizeFeatureCollection(request.payload));
    }

    const text = getPayloadText(request);
    const parsed = text ? JSON.parse(text) as unknown : null;

    if (!isFeatureCollection(parsed)) {
      throw new Error("GeoJSON import expects a FeatureCollection.");
    }

    return createVectorDataset(request, this.label, normalizeFeatureCollection(parsed));
  }
}

export class CsvImportAdapter implements SpatialImportAdapter {
  readonly format = "csv" as const;
  readonly label = "CSV";
  readonly futureGdalDriver = "CSV";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    const text = getPayloadText(request);

    if (!text) throw new Error("CSV import expects text payload.");

    const delimiter = request.options?.delimiter ?? ",";
    const [headerLine, ...rows] = text.trim().split(/\r?\n/);
    const headers = headerLine.split(delimiter).map((header) => header.trim());
    const longitudeField = request.options?.longitudeField ?? findField(headers, ["lon", "lng", "longitude", "x"]);
    const latitudeField = request.options?.latitudeField ?? findField(headers, ["lat", "latitude", "y"]);

    if (!longitudeField || !latitudeField) {
      return createUnsupportedDataset(request, this.label, "CSV needs longitude/latitude fields or explicit import options.", this.futureGdalDriver);
    }

    const features = rows.flatMap((row, index): Feature<Point>[] => {
      const values = parseCsvRow(row, delimiter);
      const properties = Object.fromEntries(headers.map((header, fieldIndex) => [header, values[fieldIndex] ?? ""]));
      const longitude = Number(properties[longitudeField]);
      const latitude = Number(properties[latitudeField]);

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];

      return [{
        type: "Feature",
        id: properties.id || `${request.id}:${index}`,
        properties,
        geometry: { type: "Point", coordinates: [longitude, latitude] },
      }];
    });

    return createVectorDataset(request, this.label, { type: "FeatureCollection", features });
  }
}

export class ShapefileImportAdapter implements SpatialImportAdapter {
  readonly format = "shapefile" as const;
  readonly label = "Shapefile";
  readonly futureGdalDriver = "ESRI Shapefile";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    const payload = request.payload;

    if (!isBinaryPayload(payload)) {
      throw new Error("Shapefile import expects a ZIP or binary payload.");
    }

    const shp = (await import("shpjs")).default;
    const result = await shp(toArrayBuffer(payload));
    const collections = Array.isArray(result) ? result : [result];
    const layers = collections
      .map((collection, index) =>
        createVectorLayer(
          getCollectionName(collection, request.name, index),
          `${request.id}:layer:${index}`,
          normalizeFeatureCollection(collection as FeatureCollection<Geometry, GeoJsonProperties>)
        )
      )
      .filter((layer) => layer.featureCount > 0);

    return {
      id: request.id,
      name: request.name,
      format: request.format,
      kind: "vector" as const,
      status: "ready" as const,
      layers,
      metadata: {
        driver: this.label,
        crs: request.options?.crs ?? "EPSG:4326",
        messages: layers.length ? [] : ["Shapefile did not contain readable vector features."],
        futureGdalDriver: this.futureGdalDriver,
      },
    };
  }
}

export class DxfImportAdapter implements SpatialImportAdapter {
  readonly format = "dxf" as const;
  readonly label = "DXF";
  readonly futureGdalDriver = "DXF";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    const text = getPayloadText(request);

    if (!text) throw new Error("DXF import expects text payload.");

    const { default: DxfParser } = await import("dxf-parser");
    const parser = new DxfParser();
    const dxf = parser.parseSync(text) as { entities?: DxfEntity[] };
    const features = (dxf.entities ?? []).flatMap((entity, index) =>
      dxfEntityToFeature(entity, `${request.id}:${index}`)
    );

    return createVectorDataset(request, this.label, {
      type: "FeatureCollection",
      features,
    });
  }
}

export class GeoPackageImportAdapter implements SpatialImportAdapter {
  readonly format = "geopackage" as const;
  readonly label = "GeoPackage";
  readonly futureGdalDriver = "GPKG";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    const payload = request.payload;

    if (!isBinaryPayload(payload)) {
      throw new Error("GeoPackage import expects binary payload.");
    }

    const { default: initSqlJs } = await import("sql.js/dist/sql-wasm.js");
    const SQL = await initSqlJs({ locateFile: () => "/vendor/geopackage/sql-wasm.wasm" });
    const db = new SQL.Database(new Uint8Array(toArrayBuffer(payload)));
    const featureTables = getGeoPackageFeatureTables(db);
    const layers = featureTables.map((table, index) => {
      const featureCollection = readGeoPackageFeatureTable(db, table);

      return createVectorLayer(table.name, `${request.id}:layer:${index}`, normalizeFeatureCollection(featureCollection));
    });

    db.close();

    return {
      id: request.id,
      name: request.name,
      format: request.format,
      kind: "vector" as const,
      status: "ready" as const,
      layers,
      metadata: {
        driver: this.label,
        crs: request.options?.crs ?? "EPSG:4326",
        messages: layers.length ? [] : ["GeoPackage has no feature tables."],
        futureGdalDriver: this.futureGdalDriver,
      },
    };
  }
}

interface SqlDatabase {
  exec(sql: string, params?: Array<string | number | Uint8Array | null>): Array<{
    columns: string[];
    values: Array<Array<string | number | Uint8Array | null>>;
  }>;
  close(): void;
}

interface GeoPackageFeatureTable {
  name: string;
  geometryColumn: string;
}

function getGeoPackageFeatureTables(db: SqlDatabase): GeoPackageFeatureTable[] {
  const geometryColumns = db.exec("SELECT table_name, column_name FROM gpkg_geometry_columns");

  if (!geometryColumns[0]) return [];

  return geometryColumns[0].values
    .map(([tableName, columnName]) => ({
      name: String(tableName),
      geometryColumn: String(columnName),
    }))
    .filter((table) => table.name.length > 0 && table.geometryColumn.length > 0);
}

function readGeoPackageFeatureTable(
  db: SqlDatabase,
  table: GeoPackageFeatureTable
): FeatureCollection<Geometry, GeoJsonProperties> {
  const rows = db.exec(`SELECT * FROM ${quoteIdentifier(table.name)}`);
  const result = rows[0];

  if (!result) {
    return { type: "FeatureCollection", features: [] };
  }

  const geometryIndex = result.columns.indexOf(table.geometryColumn);

  if (geometryIndex < 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = result.values.flatMap((row, rowIndex): Feature<Geometry, GeoJsonProperties>[] => {
    const geometryValue = row[geometryIndex];
    const geometry = geometryValue instanceof Uint8Array ? decodeGeoPackageGeometry(geometryValue) : null;

    if (!geometry) return [];

    const properties = Object.fromEntries(
      result.columns
        .map((column, columnIndex) => [column, row[columnIndex]] as const)
        .filter(([column]) => column !== table.geometryColumn)
        .map(([column, value]) => [column, value instanceof Uint8Array ? `[${value.byteLength} bytes]` : value])
    ) as GeoJsonProperties;

    return [{
      type: "Feature",
      id: `${table.name}:${rowIndex}`,
      properties,
      geometry,
    }];
  });

  return { type: "FeatureCollection", features };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function decodeGeoPackageGeometry(bytes: Uint8Array): Geometry | null {
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return null;

  const flags = bytes[3] ?? 0;
  const envelopeCode = (flags >> 1) & 0b111;
  const envelopeLength = [0, 32, 48, 48, 64][envelopeCode] ?? 0;
  const wkbOffset = 8 + envelopeLength;

  return decodeWkbGeometry(new DataView(bytes.buffer, bytes.byteOffset + wkbOffset, bytes.byteLength - wkbOffset), 0).geometry;
}

function decodeWkbGeometry(view: DataView, offset: number): { geometry: Geometry | null; offset: number } {
  const littleEndian = view.getUint8(offset) === 1;
  let cursor = offset + 1;
  const rawType = view.getUint32(cursor, littleEndian);
  cursor += 4;
  const { baseType, hasM, hasZ } = parseWkbType(rawType);

  if (baseType === 1) {
    const point = readWkbPosition(view, cursor, littleEndian, hasZ, hasM);
    return { geometry: { type: "Point", coordinates: point.position }, offset: point.offset };
  }

  if (baseType === 2) {
    const line = readWkbPositionArray(view, cursor, littleEndian, hasZ, hasM);
    return { geometry: { type: "LineString", coordinates: line.coordinates }, offset: line.offset };
  }

  if (baseType === 3) {
    const polygon = readWkbPolygon(view, cursor, littleEndian, hasZ, hasM);
    return { geometry: { type: "Polygon", coordinates: polygon.coordinates }, offset: polygon.offset };
  }

  if (baseType === 4 || baseType === 5 || baseType === 6) {
    const count = view.getUint32(cursor, littleEndian);
    cursor += 4;
    const geometries: Geometry[] = [];

    for (let index = 0; index < count; index += 1) {
      const decoded = decodeWkbGeometry(view, cursor);
      cursor = decoded.offset;
      if (decoded.geometry) geometries.push(decoded.geometry);
    }

    if (baseType === 4) {
      return {
        geometry: {
          type: "MultiPoint",
          coordinates: geometries.flatMap((geometry) => geometry.type === "Point" ? [geometry.coordinates] : []),
        },
        offset: cursor,
      };
    }

    if (baseType === 5) {
      return {
        geometry: {
          type: "MultiLineString",
          coordinates: geometries.flatMap((geometry) => geometry.type === "LineString" ? [geometry.coordinates] : []),
        },
        offset: cursor,
      };
    }

    return {
      geometry: {
        type: "MultiPolygon",
        coordinates: geometries.flatMap((geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : []),
      },
      offset: cursor,
    };
  }

  return { geometry: null, offset: cursor };
}

function parseWkbType(rawType: number): { baseType: number; hasM: boolean; hasZ: boolean } {
  const ewkbHasZ = Boolean(rawType & 0x80000000);
  const ewkbHasM = Boolean(rawType & 0x40000000);
  const sqlMmType = rawType & 0xffff;
  const typeFamily = Math.floor(sqlMmType / 1000);

  return {
    baseType: sqlMmType % 1000,
    hasZ: ewkbHasZ || typeFamily === 1 || typeFamily === 3,
    hasM: ewkbHasM || typeFamily === 2 || typeFamily === 3,
  };
}

function readWkbPosition(
  view: DataView,
  offset: number,
  littleEndian: boolean,
  hasZ: boolean,
  hasM: boolean
): { position: Position; offset: number } {
  const x = view.getFloat64(offset, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);
  let cursor = offset + 16;
  const position: Position = [x, y];

  if (hasZ) {
    position.push(view.getFloat64(cursor, littleEndian));
    cursor += 8;
  }

  if (hasM) {
    cursor += 8;
  }

  return { position, offset: cursor };
}

function readWkbPositionArray(
  view: DataView,
  offset: number,
  littleEndian: boolean,
  hasZ: boolean,
  hasM: boolean
): { coordinates: Position[]; offset: number } {
  const count = view.getUint32(offset, littleEndian);
  let cursor = offset + 4;
  const coordinates: Position[] = [];

  for (let index = 0; index < count; index += 1) {
    const point = readWkbPosition(view, cursor, littleEndian, hasZ, hasM);
    coordinates.push(point.position);
    cursor = point.offset;
  }

  return { coordinates, offset: cursor };
}

function readWkbPolygon(
  view: DataView,
  offset: number,
  littleEndian: boolean,
  hasZ: boolean,
  hasM: boolean
): { coordinates: Position[][]; offset: number } {
  const ringCount = view.getUint32(offset, littleEndian);
  let cursor = offset + 4;
  const coordinates: Position[][] = [];

  for (let index = 0; index < ringCount; index += 1) {
    const ring = readWkbPositionArray(view, cursor, littleEndian, hasZ, hasM);
    coordinates.push(ring.coordinates);
    cursor = ring.offset;
  }

  return { coordinates, offset: cursor };
}

export class KmlImportAdapter implements SpatialImportAdapter {
  readonly format = "kml" as const;
  readonly label = "KML";
  readonly futureGdalDriver = "LIBKML";

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format && Boolean(request.payload);
  }

  async parse(request: SpatialImportRequest) {
    const text = getPayloadText(request);

    if (!text) throw new Error("KML import expects text payload.");

    const placemarks = Array.from(text.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g));
    const features = placemarks.flatMap((match, index): Feature<Geometry, GeoJsonProperties>[] => {
      const placemark = match[0];
      const name = placemark.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
      const coordinates = placemark.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1]?.trim();

      if (!coordinates) return [];

      const positions = coordinates
        .split(/\s+/)
        .map((tuple) => tuple.split(",").map(Number))
        .filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]));

      if (!positions.length) return [];

      const geometry: Geometry = placemark.includes("<Polygon")
        ? { type: "Polygon", coordinates: [[...positions, positions[0]]] }
        : placemark.includes("<LineString")
          ? { type: "LineString", coordinates: positions }
          : { type: "Point", coordinates: positions[0] };

      return [{ type: "Feature", id: `${request.id}:${index}`, properties: { name }, geometry }];
    });

    return createVectorDataset(request, this.label, { type: "FeatureCollection", features });
  }
}

export class UnsupportedSpatialImportAdapter implements SpatialImportAdapter {
  constructor(
    readonly format: SpatialImportFormat,
    readonly label: string,
    readonly futureGdalDriver: string,
    private readonly message: string
  ) {}

  canParse(request: SpatialImportRequest): boolean {
    return request.format === this.format;
  }

  async parse(request: SpatialImportRequest) {
    return createUnsupportedDataset(request, this.label, this.message, this.futureGdalDriver);
  }
}

export function createDefaultSpatialImportAdapters(): SpatialImportAdapter[] {
  return [
    new GeoJsonImportAdapter(),
    new CsvImportAdapter(),
    new KmlImportAdapter(),
    new ShapefileImportAdapter(),
    new GeoPackageImportAdapter(),
    new DxfImportAdapter(),
    new UnsupportedSpatialImportAdapter("geotiff", "GeoTIFF", "GTiff", "GeoTIFF raster reading requires raster band access through a future GDAL adapter."),
    new UnsupportedSpatialImportAdapter("geoparquet", "GeoParquet", "Parquet", "GeoParquet requires columnar metadata and geometry decoding adapter."),
    new UnsupportedSpatialImportAdapter("dem", "Raster DEM", "GTiff/VRT/AAIGrid", "Raster DEM import requires raster band decoding adapter."),
    new UnsupportedSpatialImportAdapter("raster-dem", "Raster DEM", "GTiff/VRT/AAIGrid", "Raster DEM import requires raster band decoding adapter."),
  ];
}

interface DxfEntity {
  type?: string;
  vertices?: Array<{ x: number; y: number; z?: number }>;
  position?: { x: number; y: number; z?: number };
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  center?: { x: number; y: number; z?: number };
  radius?: number;
  layer?: string;
}

function dxfEntityToFeature(
  entity: DxfEntity,
  id: string
): Feature<Geometry, GeoJsonProperties>[] {
  const properties = {
    layer: entity.layer ?? "0",
    sourceType: entity.type ?? "ENTITY",
  };

  if (entity.type === "POINT" && entity.position) {
    return [pointFeature(entity.position.x, entity.position.y, properties, id)];
  }

  if (entity.type === "LINE" && entity.startPoint && entity.endPoint) {
    return [lineFeature([toPosition(entity.startPoint), toPosition(entity.endPoint)], properties, id)];
  }

  if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && entity.vertices?.length) {
    const coordinates = entity.vertices.map(toPosition);
    const closed = coordinates.length > 2 && arePositionsEqual(coordinates[0], coordinates[coordinates.length - 1]);

    return [
      {
        type: "Feature",
        id,
        properties,
        geometry: closed
          ? { type: "Polygon", coordinates: [coordinates] }
          : { type: "LineString", coordinates },
      },
    ];
  }

  if (entity.type === "CIRCLE" && entity.center && entity.radius) {
    return [polygonFeature(circleCoordinates(entity.center, entity.radius), properties, id)];
  }

  return [];
}

function pointFeature(
  longitude: number,
  latitude: number,
  properties: GeoJsonProperties = {},
  id?: string
): Feature<Point, GeoJsonProperties> {
  return {
    type: "Feature",
    id,
    properties,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  };
}

function lineFeature(
  coordinates: Position[],
  properties: GeoJsonProperties,
  id: string
): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id,
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

function polygonFeature(
  coordinates: Position[],
  properties: GeoJsonProperties,
  id: string
): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id,
    properties,
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

function circleCoordinates(center: { x: number; y: number }, radius: number): Position[] {
  const steps = 48;
  const coordinates = Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return [center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius] as Position;
  });

  return [...coordinates, coordinates[0]];
}

function toPosition(point: { x: number; y: number; z?: number }): Position {
  return typeof point.z === "number" ? [point.x, point.y, point.z] : [point.x, point.y];
}

function arePositionsEqual(left?: Position, right?: Position): boolean {
  return Boolean(left && right && left[0] === right[0] && left[1] === right[1]);
}

function isBinaryPayload(
  payload: SpatialImportRequest["payload"]
): payload is ArrayBuffer | Uint8Array {
  return payload instanceof ArrayBuffer || payload instanceof Uint8Array;
}

function toArrayBuffer(payload: Exclude<SpatialImportRequest["payload"], undefined | string | FeatureCollection<Geometry, GeoJsonProperties>>): ArrayBuffer {
  if (payload instanceof ArrayBuffer) {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return new Uint8Array(payload).buffer;
  }

  return payload as ArrayBuffer;
}

function getCollectionName(
  collection: FeatureCollection<Geometry, GeoJsonProperties> & { fileName?: string },
  fallbackName: string,
  index: number
): string {
  return collection.fileName ?? (index === 0 ? fallbackName : `${fallbackName} ${index + 1}`);
}

function findField(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) => candidates.includes(header.toLowerCase()));
}

function parseCsvRow(row: string, delimiter: string): string[] {
  return row.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ""));
}
