import type { DataSourceKind } from "@/types/formiq";
import type {
  DataSourceEngineImportOptions,
  DataSourceEngineImportResult,
  DataSourceFetchContext,
  DataSourceHealth,
  DataSourceResult,
  IDataSource,
} from "./types";
import { SourceRegistry } from "./SourceRegistry";

interface DataSourceCacheEntry {
  result: DataSourceResult;
  expiresAt: number;
}

export class DataSourceEngine {
  private readonly memoryCache = new Map<string, DataSourceCacheEntry>();

  constructor(readonly registry = new SourceRegistry()) {}

  register(source: IDataSource): this {
    this.registry.register(source);
    return this;
  }

  async healthCheck(source?: DataSourceKind): Promise<DataSourceHealth[]> {
    const sources = source ? [this.registry.require(source)] : this.registry.list();
    return Promise.all(sources.map((dataSource) => dataSource.healthCheck()));
  }

  async fetchSource(
    source: DataSourceKind,
    options: DataSourceFetchContext
  ): Promise<DataSourceResult> {
    const dataSource = this.registry.require(source);
    const cacheKey = this.createCacheKey(source, options.bbox);
    const cached = options.forceRefresh ? null : this.readMemoryCache(cacheKey);

    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
          cacheLayer: "memory",
        },
      };
    }

    const result = await dataSource.import({
      bbox: options.bbox,
      signal: options.signal,
      forceRefresh: options.forceRefresh,
    });

    this.writeMemoryCache(cacheKey, dataSource, result);
    return result;
  }

  async import(options: DataSourceEngineImportOptions): Promise<DataSourceEngineImportResult> {
    const results: DataSourceResult[] = [];
    const sourceStates: DataSourceHealth[] = [];

    for (const source of options.sources) {
      const dataSource = this.registry.require(source);
      const started: DataSourceHealth = {
        source,
        status: "loading",
        checkedAt: new Date().toISOString(),
      };

      options.onSourceStart?.(started);

      try {
        const result = await this.fetchSource(source, {
          bbox: options.bbox,
          signal: options.signal,
          forceRefresh: options.forceRefresh,
        });

        results.push(result);
        const completed: DataSourceHealth = {
          source,
          status: result.status,
          checkedAt: result.timestamp,
          message: typeof result.metadata.message === "string" ? result.metadata.message : undefined,
        };
        sourceStates.push(completed);
        options.onSourceComplete?.(result);
      } catch (error) {
        const failedResult = await dataSource.healthCheck().catch<DataSourceHealth>(() => ({
          source,
          status: "error",
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : "Data source import failed.",
        }));

        sourceStates.push(failedResult);
      }
    }

    return {
      bbox: options.bbox,
      timestamp: new Date().toISOString(),
      results,
      sourceStates,
    };
  }

  clearCache(source?: DataSourceKind): void {
    if (!source) {
      this.memoryCache.clear();
      return;
    }

    Array.from(this.memoryCache.keys())
      .filter((key) => key.startsWith(`${source}:`))
      .forEach((key) => this.memoryCache.delete(key));
    this.registry.get(source)?.clearCache?.();
  }

  private readMemoryCache(cacheKey: string): DataSourceResult | null {
    const cached = this.memoryCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt < Date.now()) {
      this.memoryCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private writeMemoryCache(cacheKey: string, source: IDataSource, result: DataSourceResult): void {
    if (!source.cache.memory || source.cache.ttlMs <= 0) {
      return;
    }

    this.memoryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + source.cache.ttlMs,
    });
  }

  private createCacheKey(source: DataSourceKind, bbox: DataSourceEngineImportOptions["bbox"]): string {
    return `${source}:${bbox.west}:${bbox.south}:${bbox.east}:${bbox.north}`;
  }
}
