import type { BoundingBox } from "@/types/gis";
import type { DataSourceKind, SourceSyncState } from "@/types/formiq";
import type { SourceAdapter, SourceAdapterResult, SourceCacheEntry } from "./types";

export interface SourceLoadProgressEvent {
  source: DataSourceKind;
  label: string;
  status: SourceSyncState["status"];
  featureCount: number;
  errorMessage: string | null;
}

export interface SourceLoadOptions {
  onSourceStart?: (event: SourceLoadProgressEvent) => void;
  onSourceComplete?: (event: SourceLoadProgressEvent) => void;
}

export class SourceManager {
  private readonly adapters = new Map<DataSourceKind, SourceAdapter>();
  private readonly cache = new Map<string, SourceCacheEntry>();
  private readonly states = new Map<DataSourceKind, SourceSyncState>();

  register(adapter: SourceAdapter): this {
    this.adapters.set(adapter.source, adapter);
    this.states.set(adapter.source, {
      source: adapter.source,
      status: "idle",
      updatedAt: null,
      version: adapter.version,
      featureCount: 0,
      cacheHit: false,
      errorMessage: null,
    });

    return this;
  }

  async loadAll(bounds: BoundingBox, options: SourceLoadOptions = {}): Promise<SourceAdapterResult[]> {
    const adapters = Array.from(this.adapters.values());
    const results: SourceAdapterResult[] = [];

    for (const adapter of adapters) {
      options.onSourceStart?.({
        source: adapter.source,
        label: adapter.source,
        status: "loading",
        featureCount: 0,
        errorMessage: null,
      });

      const result = await this.loadSource(adapter.source, bounds);
      const state = this.states.get(adapter.source);

      options.onSourceComplete?.({
        source: adapter.source,
        label: adapter.source,
        status: state?.status ?? "ready",
        featureCount: result.features.length,
        errorMessage: state?.errorMessage ?? null,
      });

      results.push(result);
    }

    return results;
  }

  async loadSource(source: DataSourceKind, bounds: BoundingBox): Promise<SourceAdapterResult> {
    const adapter = this.adapters.get(source);

    if (!adapter) {
      throw new Error(`Source adapter "${source}" is not registered.`);
    }

    const cacheKey = this.createCacheKey(source, bounds);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      this.states.set(source, {
        source,
        status: "ready",
        updatedAt: cached.cachedAt,
        version: adapter.version,
        featureCount: cached.result.features.length,
        cacheHit: true,
        errorMessage: null,
      });

      return cached.result;
    }

    this.states.set(source, {
      source,
      status: "loading",
      updatedAt: null,
      version: adapter.version,
      featureCount: 0,
      cacheHit: false,
      errorMessage: null,
    });

    try {
      const result = await adapter.fetch({ bounds });
      const cachedAt = new Date().toISOString();

      this.cache.set(cacheKey, {
        cacheKey,
        result,
        cachedAt,
      });

      this.states.set(source, {
        source,
        status: "ready",
        updatedAt: cachedAt,
        version: result.version,
        featureCount: result.features.length,
        cacheHit: false,
        errorMessage: null,
      });

      return result;
    } catch (error) {
      this.states.set(source, {
        source,
        status: "error",
        updatedAt: new Date().toISOString(),
        version: adapter.version,
        featureCount: 0,
        cacheHit: false,
        errorMessage: error instanceof Error ? error.message : "Unknown source error.",
      });

      return {
        source,
        version: adapter.version,
        features: [],
      };
    }
  }

  invalidate(source?: DataSourceKind): void {
    if (!source) {
      this.cache.clear();
      return;
    }

    Array.from(this.cache.keys())
      .filter((key) => key.startsWith(`${source}:`))
      .forEach((key) => this.cache.delete(key));
  }

  getStates(): SourceSyncState[] {
    return Array.from(this.states.values());
  }

  private createCacheKey(source: DataSourceKind, bounds: BoundingBox): string {
    return `${source}:${bounds.west}:${bounds.south}:${bounds.east}:${bounds.north}`;
  }
}
