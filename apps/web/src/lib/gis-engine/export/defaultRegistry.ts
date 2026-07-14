import { UnsupportedExporter } from "./BaseExporter";
import { ExportEngine } from "./ExportEngine";
import { ExportRegistry } from "./ExportRegistry";
import { createDefaultExportAdapters } from "./adapters";

export function createDefaultExportRegistry(): ExportRegistry {
  const registry = new ExportRegistry();
  createDefaultExportAdapters().forEach((adapter) => registry.register(adapter));
  registry
    .register(new UnsupportedExporter("shapefile", "Shapefile"))
    .register(new UnsupportedExporter("geopackage", "GeoPackage"))
    .register(new UnsupportedExporter("pmtiles", "PMTiles"))
    .register(new UnsupportedExporter("mbtiles", "MBTiles"))
    .register(new UnsupportedExporter("geoparquet", "GeoParquet"));
  return registry;
}

export function createDefaultExportEngine(): ExportEngine {
  return new ExportEngine(createDefaultExportRegistry());
}
