import { describe, expect, it } from "vitest";
import { DataSourceEngine } from "@/lib/gis-engine/data-source";
import { DataFusionEngine, SourceManager } from "@/lib/gis-engine/fusion";
import { PMTilesAdapter, PMTilesDataSource } from "@/lib/gis-engine/pmtiles";

describe("PMTilesAdapter", () => {
  it("reads metadata and tiles from a real PMTiles v3 archive", async () => {
    const bytes = createSingleTileArchive(new Uint8Array([0x1a, 0x02, 0x03, 0x04]), 1);
    const source = { id: "archive", bytes };
    const adapter = new PMTilesAdapter();

    const metadata = await adapter.readMetadata(source);
    const tile = await adapter.getTile(source, { z: 0, x: 0, y: 0 });

    expect(metadata.name).toBe("Unit Test PMTiles");
    expect(metadata.tileType).toBe("mvt");
    expect(metadata.vectorLayers).toEqual(["buildings"]);
    expect(metadata.bounds).toEqual({ west: -180, south: -85, east: 180, north: 85 });
    expect(tile?.contentType).toBe("application/vnd.mapbox-vector-tile");
    expect(Array.from(tile?.data ?? [])).toEqual([0x1a, 0x02, 0x03, 0x04]);
  });

  it("exposes PMTiles through the DataSourceEngine source contract", async () => {
    const bytes = createSingleTileArchive(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 2);
    const adapter = new PMTilesAdapter();
    const dataSource = new PMTilesDataSource({ id: "raster", bytes }, adapter);

    const health = await dataSource.healthCheck();
    const result = await dataSource.fetch({ bbox: { west: -180, south: -85, east: 180, north: 85 } });
    const tile = await dataSource.getTile({ z: 0, x: 0, y: 0 });

    expect(health.status).toBe("ready");
    expect(result.metadata.tileType).toBe("png");
    expect(tile?.contentType).toBe("image/png");
  });

  it("decodes MVT features into internal FORMIQ source features", async () => {
    const bytes = createSingleTileArchive(createBuildingMvtTile(), 1);
    const source = { id: "mvt", bytes };
    const adapter = new PMTilesAdapter();
    const bbox = { west: -180, south: -85, east: 180, north: 85 };

    const geojson = await adapter.queryFeatures(source, bbox);
    const sourceFeatures = await adapter.querySourceFeatures(source, bbox);

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].id).toBe("7");
    expect(geojson.features[0].properties?.height).toBe(12);
    expect(sourceFeatures).toHaveLength(1);
    expect(sourceFeatures[0]).toMatchObject({
      source: "pmtiles",
      sourceFeatureId: "7",
      kind: "building",
      height: 12,
    });
    expect(sourceFeatures[0].tags).toMatchObject({
      building: "yes",
      "_formiq:mvtLayer": "buildings",
    });
    expect(adapter.decodedCacheSize).toBe(1);
  });

  it("feeds decoded PMTiles features into DataFusionEngine through DataSourceEngine", async () => {
    const adapter = new PMTilesAdapter();
    const dataSourceEngine = new DataSourceEngine().register(
      new PMTilesDataSource({ id: "pmtiles-fusion", bytes: createSingleTileArchive(createBuildingMvtTile(), 1) }, adapter)
    );
    const fusion = new DataFusionEngine(new SourceManager(dataSourceEngine));

    const result = await fusion.fuse({ west: -180, south: -85, east: 180, north: 85 });

    expect(result.statistics.inputFeatureCount).toBe(1);
    expect(result.collections.buildings).toHaveLength(1);
    expect(result.layers.some((layer) => layer.id.includes("buildings"))).toBe(true);
  });
});

function createSingleTileArchive(tileBytes: Uint8Array, tileType: number): ArrayBuffer {
  const rootDirectory = new Uint8Array([
    ...writeVarint(1),
    ...writeVarint(0),
    ...writeVarint(1),
    ...writeVarint(tileBytes.byteLength),
    ...writeVarint(1),
  ]);
  const metadata = new TextEncoder().encode(JSON.stringify({
    name: "Unit Test PMTiles",
    vector_layers: [{ id: "buildings" }],
  }));
  const headerSize = 127;
  const rootOffset = headerSize;
  const metadataOffset = rootOffset + rootDirectory.byteLength;
  const tileDataOffset = metadataOffset + metadata.byteLength;
  const archive = new Uint8Array(tileDataOffset + tileBytes.byteLength);
  const view = new DataView(archive.buffer);

  archive.set(new TextEncoder().encode("PMTiles"), 0);
  view.setUint8(7, 3);
  writeUint64(view, 8, rootOffset);
  writeUint64(view, 16, rootDirectory.byteLength);
  writeUint64(view, 24, metadataOffset);
  writeUint64(view, 32, metadata.byteLength);
  writeUint64(view, 40, 0);
  writeUint64(view, 48, 0);
  writeUint64(view, 56, tileDataOffset);
  writeUint64(view, 64, tileBytes.byteLength);
  writeUint64(view, 72, 1);
  writeUint64(view, 80, 1);
  writeUint64(view, 88, 1);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, tileType);
  view.setUint8(100, 0);
  view.setUint8(101, 0);
  view.setInt32(102, -180 * 10_000_000, true);
  view.setInt32(106, -85 * 10_000_000, true);
  view.setInt32(110, 180 * 10_000_000, true);
  view.setInt32(114, 85 * 10_000_000, true);
  view.setUint8(118, 0);
  view.setInt32(119, 0, true);
  view.setInt32(123, 0, true);

  archive.set(rootDirectory, rootOffset);
  archive.set(metadata, metadataOffset);
  archive.set(tileBytes, tileDataOffset);
  return archive.buffer;
}

function writeVarint(value: number): number[] {
  const bytes: number[] = [];
  let current = value;
  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 128);
  }
  bytes.push(current);
  return bytes;
}

function writeUint64(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true);
}

function createBuildingMvtTile(): Uint8Array {
  const geometry = encodePackedVarints([
    9,
    encodeZigZag(1024),
    encodeZigZag(1024),
    26,
    encodeZigZag(2048),
    encodeZigZag(0),
    encodeZigZag(0),
    encodeZigZag(2048),
    encodeZigZag(-2048),
    encodeZigZag(0),
    15,
  ]);
  const tags = encodePackedVarints([0, 0, 1, 1]);
  const feature = concatBytes(
    fieldVarint(1, 7),
    fieldBytes(2, tags),
    fieldVarint(3, 3),
    fieldBytes(4, geometry),
  );
  const layer = concatBytes(
    fieldString(1, "buildings"),
    fieldBytes(2, feature),
    fieldString(3, "building"),
    fieldString(3, "height"),
    fieldBytes(4, fieldString(1, "yes")),
    fieldBytes(4, fieldVarint(4, 12)),
    fieldVarint(5, 4096),
    fieldVarint(15, 2),
  );

  return fieldBytes(3, layer);
}

function fieldVarint(field: number, value: number): Uint8Array {
  return new Uint8Array([...writeVarint((field << 3) | 0), ...writeVarint(value)]);
}

function fieldBytes(field: number, value: Uint8Array): Uint8Array {
  return new Uint8Array([...writeVarint((field << 3) | 2), ...writeVarint(value.byteLength), ...value]);
}

function fieldString(field: number, value: string): Uint8Array {
  return fieldBytes(field, new TextEncoder().encode(value));
}

function encodePackedVarints(values: number[]): Uint8Array {
  return new Uint8Array(values.flatMap(writeVarint));
}

function encodeZigZag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
