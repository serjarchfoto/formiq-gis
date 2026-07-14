import type { OfflineTileSource } from "./types";

export class PMTilesRegistry {
  private readonly sources = new Map<string, OfflineTileSource>();

  register(source: OfflineTileSource): this {
    this.sources.set(source.id, source);
    return this;
  }

  get(id: string): OfflineTileSource | null {
    return this.sources.get(id) ?? null;
  }

  require(id: string): OfflineTileSource {
    const source = this.get(id);
    if (!source) throw new Error(`PMTiles source ${id} is not registered.`);
    return source;
  }

  list(): OfflineTileSource[] {
    return Array.from(this.sources.values());
  }
}
