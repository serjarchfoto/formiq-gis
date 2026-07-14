import type { GPULayerDefinition, GPULayerKind, GPURenderPlan } from "./types";

export class GPULayerRegistry {
  private readonly layers = new Map<string, GPULayerDefinition>();

  register(layer: GPULayerDefinition): this {
    this.layers.set(layer.id, layer);
    return this;
  }

  list(): GPULayerDefinition[] {
    return Array.from(this.layers.values());
  }
}

export class GPUVisualizationEngine {
  constructor(private readonly registry = new GPULayerRegistry()) {}

  createLayer(kind: GPULayerKind, id: string, sourceId: string, props: GPULayerDefinition["props"] = {}): GPULayerDefinition {
    const layer = { id, kind, sourceId, visible: true, props };
    this.registry.register(layer);
    return layer;
  }

  createRenderPlan(estimatedInstances = 0): GPURenderPlan {
    const layers = this.registry.list();

    return {
      layers,
      requiresWebGL2: layers.some((layer) => layer.kind === "point-cloud" || layer.kind === "instanced"),
      estimatedInstances,
    };
  }
}
