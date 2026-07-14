import { LocalTileCache } from "@/lib/gis-engine/pmtiles";
import type { TileCoord } from "@/lib/gis-engine/tile-builder";
import type { TileProvider, TileResponse } from "./types";

export class TileRegistry {
  private readonly providers = new Map<string, TileProvider>();

  register(provider: TileProvider): this {
    this.providers.set(provider.metadata.id, provider);
    return this;
  }

  require(id: string): TileProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Tile provider ${id} is not registered.`);
    return provider;
  }

  list(): TileProvider[] {
    return Array.from(this.providers.values());
  }
}

export class TileCache extends LocalTileCache<TileResponse> {}

export class TileService {
  constructor(private readonly registry = new TileRegistry(), private readonly cache = new TileCache(2048, 30 * 60 * 1000)) {}

  register(provider: TileProvider): this {
    this.registry.register(provider);
    return this;
  }

  async getTile(providerId: string, coord: TileCoord): Promise<TileResponse | null> {
    const key = `${providerId}:${coord.z}:${coord.x}:${coord.y}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const tile = await this.registry.require(providerId).getTile(coord);
    if (tile) this.cache.set(key, tile);
    return tile;
  }

  get providers(): TileProvider[] {
    return this.registry.list();
  }
}
