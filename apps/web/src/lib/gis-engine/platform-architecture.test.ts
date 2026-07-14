import { describe, expect, it } from "vitest";
import { SpatialImportPipeline } from "@/features/import/spatial-import";
import {
  CameraImprovementController,
  GPUVisualizationEngine,
  PlaceholderGeoParquetAdapter,
  PMTilesAdapter,
  PMTilesDataSource,
  QueryEngine,
  SnappingTool,
  TerrainLodController,
  TileBuilder,
  TileService,
  type TileProvider,
} from "@/lib";

describe("professional GIS platform architecture", () => {
  it("imports GeoJSON and CSV through the spatial import pipeline", async () => {
    const pipeline = new SpatialImportPipeline();
    const result = await pipeline.run([
      {
        id: "geojson-1",
        name: "GeoJSON sample",
        format: "geojson",
        payload: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [37, 55] } }],
        },
      },
      {
        id: "csv-1",
        name: "CSV sample",
        format: "csv",
        payload: "id,lon,lat\n1,37,55",
      },
    ]);

    expect(result.datasets.every((dataset) => dataset.status === "ready")).toBe(true);
    expect(result.layers).toHaveLength(2);
  });

  it("returns explicit unsupported datasets for future GDAL-backed formats", async () => {
    const result = await new SpatialImportPipeline().run([
      { id: "geotiff-1", name: "GeoTIFF", format: "geotiff", payload: new Uint8Array([1, 2, 3]) },
    ]);

    expect(result.datasets[0].status).toBe("unsupported");
    expect(result.datasets[0].metadata.futureGdalDriver).toBe("GTiff");
  });

  it("registers PMTiles as an offline DataSourceEngine-compatible source", async () => {
    const source = { id: "offline", bytes: createMinimalPMTilesArchive() };
    const dataSource = new PMTilesDataSource(source, new PMTilesAdapter());
    const health = await dataSource.healthCheck();
    const tile = await dataSource.getTile({ z: 0, x: 0, y: 0 });

    expect(health.status).toBe("ready");
    expect(dataSource.supportsTiles).toBe(true);
    expect(tile?.data.byteLength).toBe(1);
  });

  it("builds a generalized tile pyramid", () => {
    const pyramid = new TileBuilder().build(
      {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { kind: "road" }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }],
      },
      { minZoom: 1, maxZoom: 2, layerName: "roads" }
    );

    expect(pyramid.tiles.length).toBeGreaterThan(0);
    expect(pyramid.maxZoom).toBe(2);
  });

  it("queries columnar and spatial data without DuckDB dependency", () => {
    const query = new QueryEngine(new PlaceholderGeoParquetAdapter());
    const result = query.columns.query({
      id: "table",
      rowCount: 2,
      columns: { id: [1, 2], name: ["a", "b"] },
    }, { where: (row) => row.name === "b" });

    expect(result.rows).toEqual([{ id: 2, name: "b" }]);
  });

  it("serves tiles through a registry and cache", async () => {
    const provider: TileProvider = {
      metadata: { id: "mvt", name: "MVT", kind: "mvt", minZoom: 0, maxZoom: 14, format: "mvt", vectorLayers: ["roads"] },
      async getTile(coord) {
        return { coord, contentType: "application/vnd.mapbox-vector-tile", data: new Uint8Array([1]), metadata: this.metadata };
      },
    };
    const service = new TileService().register(provider);

    expect((await service.getTile("mvt", { z: 0, x: 0, y: 0 }))?.data[0]).toBe(1);
  });

  it("creates GPU layer plans and 3D control policies", () => {
    const gpu = new GPUVisualizationEngine();
    gpu.createLayer("heatmap", "heat", "points");
    gpu.createLayer("point-cloud", "cloud", "points");

    expect(gpu.createRenderPlan(1000).requiresWebGL2).toBe(true);
    expect(new TerrainLodController().selectLod(12, 1).demZoom).toBe(13);
    expect(new CameraImprovementController().getPitchForMode("presentation-3d")).toBe(62);
  });

  it("adds professional tool modules", () => {
    expect(new SnappingTool().snap([0, 0], [[0.00001, 0]], 10)).toEqual([0.00001, 0]);
  });
});

function createMinimalPMTilesArchive(): ArrayBuffer {
  const rootDirectory = new Uint8Array([1, 0, 1, 1, 1]);
  const metadata = new TextEncoder().encode(JSON.stringify({ name: "Offline tiles" }));
  const tile = new Uint8Array([1]);
  const headerSize = 127;
  const rootOffset = headerSize;
  const metadataOffset = rootOffset + rootDirectory.byteLength;
  const tileOffset = metadataOffset + metadata.byteLength;
  const archive = new Uint8Array(tileOffset + tile.byteLength);
  const view = new DataView(archive.buffer);

  archive.set(new TextEncoder().encode("PMTiles"), 0);
  view.setUint8(7, 3);
  writeUint64(view, 8, rootOffset);
  writeUint64(view, 16, rootDirectory.byteLength);
  writeUint64(view, 24, metadataOffset);
  writeUint64(view, 32, metadata.byteLength);
  writeUint64(view, 56, tileOffset);
  writeUint64(view, 64, tile.byteLength);
  writeUint64(view, 72, 1);
  writeUint64(view, 80, 1);
  writeUint64(view, 88, 1);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, 1);
  view.setInt32(102, -180 * 10_000_000, true);
  view.setInt32(106, -85 * 10_000_000, true);
  view.setInt32(110, 180 * 10_000_000, true);
  view.setInt32(114, 85 * 10_000_000, true);

  archive.set(rootDirectory, rootOffset);
  archive.set(metadata, metadataOffset);
  archive.set(tile, tileOffset);
  return archive.buffer;
}

function writeUint64(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true);
}
