import type { SpatialImportAdapter, SpatialImportFormat, SpatialImportRequest } from "./types";

export class SpatialImportRegistry {
  private readonly adapters = new Map<SpatialImportFormat, SpatialImportAdapter>();

  register(adapter: SpatialImportAdapter): this {
    this.adapters.set(adapter.format, adapter);
    return this;
  }

  require(format: SpatialImportFormat): SpatialImportAdapter {
    const adapter = this.adapters.get(format);

    if (!adapter) {
      throw new Error(`No spatial import adapter registered for ${format}.`);
    }

    return adapter;
  }

  resolve(request: SpatialImportRequest): SpatialImportAdapter {
    const adapter = this.require(request.format);

    if (!adapter.canParse(request)) {
      throw new Error(`${adapter.label} cannot parse import request ${request.id}.`);
    }

    return adapter;
  }

  list(): SpatialImportAdapter[] {
    return Array.from(this.adapters.values());
  }
}
