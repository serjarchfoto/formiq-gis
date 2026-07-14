import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { PMTilesViewportTileManager, createPMTilesPresentationSources } from "./pmtilesPresentation";
import type { GISLayer } from "@/types/gis";

describe("PMTilesViewportTileManager", () => {
  it("loads viewport tiles through scheduler and syncs MapLibre sources", async () => {
    const manager = new PMTilesViewportTileManager();
    const map = createMockMap();
    const source = { id: "pmtiles-layer", bytes: createSingleTileArchive(createPointMvtTile(), 1) };
    const layer = createPMTilesLayer(source.id, true);
    const presentationSources = createPMTilesPresentationSources([source], [layer]);

    const initialStats = await manager.update(map as unknown as MapLibreMap, presentationSources, {
      zoom: 0,
      bbox: { west: -180, south: -85, east: 180, north: 85 },
      center: [0, 0],
      bearing: 0,
      pitch: 0,
    });
    expect(initialStats.loadingTiles).toBe(1);

    await waitFor(() => manager.getStats().loadedTiles === 1);
    const readyStats = manager.getStats();

    expect(readyStats.visibleTiles).toBe(1);
    expect(readyStats.decodedFeatures).toBe(1);
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(3);

    await manager.update(map as unknown as MapLibreMap, presentationSources, {
      zoom: 0,
      bbox: { west: -180, south: -85, east: 180, north: 85 },
      center: [0, 0],
      bearing: 10,
      pitch: 30,
    });

    expect(map.addSourceCount).toBe(1);
  });

  it("moves hidden PMTiles tiles to cache without deleting sources immediately", async () => {
    const manager = new PMTilesViewportTileManager();
    const map = createMockMap();
    const source = { id: "pmtiles-layer", bytes: createSingleTileArchive(createPointMvtTile(), 1) };
    const visibleLayer = createPMTilesLayer(source.id, true);

    await manager.update(map as unknown as MapLibreMap, createPMTilesPresentationSources([source], [visibleLayer]), {
      zoom: 0,
      bbox: { west: -180, south: -85, east: 180, north: 85 },
      center: [0, 0],
      bearing: 0,
      pitch: 0,
    });
    await waitFor(() => manager.getStats().loadedTiles === 1);

    const hiddenLayer = createPMTilesLayer(source.id, false);
    const stats = await manager.update(map as unknown as MapLibreMap, createPMTilesPresentationSources([source], [hiddenLayer]), {
      zoom: 0,
      bbox: { west: -180, south: -85, east: 180, north: 85 },
      center: [0, 0],
      bearing: 0,
      pitch: 0,
    });

    expect(stats.visibleTiles).toBe(0);
    expect(stats.cachedTiles).toBe(1);
    expect(map.sources.size).toBe(1);
  });
});

function createMockMap() {
  const sources = new Map<string, { data: unknown }>();
  const layers = new Map<string, unknown>();

  return {
    sources,
    layers,
    addSourceCount: 0,
    getSource(id: string) {
      const source = sources.get(id);
      return source ? { setData: (data: unknown) => { source.data = data; } } : undefined;
    },
    addSource(id: string, value: { data: unknown }) {
      this.addSourceCount += 1;
      sources.set(id, { data: value.data });
    },
    removeSource(id: string) {
      sources.delete(id);
    },
    getLayer(id: string) {
      return layers.get(id);
    },
    addLayer(layer: { id: string }) {
      layers.set(layer.id, layer);
    },
    removeLayer(id: string) {
      layers.delete(id);
    },
    setLayoutProperty() {},
    setPaintProperty() {},
  };
}

function createPMTilesLayer(sourceId: string, visible: boolean): GISLayer {
  return {
    id: sourceId,
    name: "PMTiles",
    visible,
    opacity: 0.8,
    sourceType: "pmtiles",
    removable: true,
    order: 0,
    category: "custom",
    geometryType: "point",
    source: {
      id: sourceId,
      name: "PMTiles",
      format: "pmtiles",
    },
    style: {
      fillColor: "#229ED9",
      lineColor: "#1D8CC2",
      lineWidth: 1,
      opacity: 0.8,
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1000) throw new Error("Timed out waiting for PMTiles presentation state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createSingleTileArchive(tileBytes: Uint8Array, tileType: number): ArrayBuffer {
  const rootDirectory = new Uint8Array([1, 0, 1, ...writeVarint(tileBytes.byteLength), 1]);
  const metadata = new TextEncoder().encode(JSON.stringify({
    name: "Presentation PMTiles",
    vector_layers: [{ id: "pois" }],
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
  writeUint64(view, 56, tileDataOffset);
  writeUint64(view, 64, tileBytes.byteLength);
  writeUint64(view, 72, 1);
  writeUint64(view, 80, 1);
  writeUint64(view, 88, 1);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, tileType);
  view.setInt32(102, -180 * 10_000_000, true);
  view.setInt32(106, -85 * 10_000_000, true);
  view.setInt32(110, 180 * 10_000_000, true);
  view.setInt32(114, 85 * 10_000_000, true);
  archive.set(rootDirectory, rootOffset);
  archive.set(metadata, metadataOffset);
  archive.set(tileBytes, tileDataOffset);
  return archive.buffer;
}

function createPointMvtTile(): Uint8Array {
  const feature = concatBytes(
    fieldVarint(1, 1),
    fieldBytes(2, encodePackedVarints([0, 0])),
    fieldVarint(3, 1),
    fieldBytes(4, encodePackedVarints([9, encodeZigZag(2048), encodeZigZag(2048)])),
  );
  const layer = concatBytes(
    fieldString(1, "pois"),
    fieldBytes(2, feature),
    fieldString(3, "class"),
    fieldBytes(4, fieldString(1, "poi")),
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
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output;
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
