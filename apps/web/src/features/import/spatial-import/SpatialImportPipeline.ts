import type { GISLayer } from "@/types/gis";
import { SpatialImportRegistry } from "./SpatialImportRegistry";
import { createDefaultSpatialImportAdapters } from "./adapters";
import type { SpatialImportDataset, SpatialImportRequest } from "./types";

export interface SpatialImportPipelineResult {
  datasets: SpatialImportDataset[];
  layers: GISLayer[];
}

export class SpatialImportPipeline {
  constructor(private readonly registry = createDefaultSpatialImportRegistry()) {}

  async run(requests: SpatialImportRequest[]): Promise<SpatialImportPipelineResult> {
    const datasets = await Promise.all(
      requests.map((request) => this.registry.resolve(request).parse(request))
    );
    const layers = datasets.flatMap((dataset, datasetIndex) =>
      dataset.layers.map((layer, layerIndex): GISLayer => ({
        id: `import-${dataset.id}-${layerIndex}`,
        name: layer.name,
        visible: true,
        opacity: 0.9,
        sourceType: dataset.format,
        removable: true,
        order: datasetIndex + layerIndex,
        category: "custom",
        geometryType: layer.geometryType,
        source: {
          id: dataset.id,
          name: dataset.name,
          format: dataset.format,
        },
        data: layer.featureCollection,
        style: {
          fillColor: "#38BDF8",
          lineColor: "#0284C7",
          lineWidth: 1.5,
          opacity: 0.9,
        },
      }))
    );

    return { datasets, layers };
  }
}

export function createDefaultSpatialImportRegistry(): SpatialImportRegistry {
  return createDefaultSpatialImportAdapters().reduce(
    (registry, adapter) => registry.register(adapter),
    new SpatialImportRegistry()
  );
}
