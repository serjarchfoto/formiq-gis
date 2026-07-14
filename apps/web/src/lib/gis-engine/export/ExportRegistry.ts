import type { ExportAdapter, ExportFormat } from "./types";

export class ExportRegistry {
  private readonly adapters = new Map<ExportFormat, ExportAdapter>();

  register(adapter: ExportAdapter): this {
    this.adapters.set(adapter.format, adapter);
    return this;
  }

  get(format: ExportFormat): ExportAdapter | null {
    return this.adapters.get(format) ?? null;
  }

  require(format: ExportFormat): ExportAdapter {
    const adapter = this.get(format);
    if (!adapter) throw new Error(`Export adapter "${format}" is not registered.`);
    return adapter;
  }

  list(): ExportAdapter[] {
    return Array.from(this.adapters.values());
  }
}
