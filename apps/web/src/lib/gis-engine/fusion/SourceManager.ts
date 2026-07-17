import type { BoundingBox } from "@/types/gis";
import type { DataSourceKind, SourceSyncState } from "@/types/formiq";
import type { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import { normalizeDataSourceStatus } from "@/lib/gis-engine/data-source/status";
import type { SourceAdapter, SourceAdapterResult, SourceCacheEntry } from "./types";
import {
  getRegisteredSourceIds,
  getSourcePriorityPlan,
  type SourcePriorityRole,
} from "./SourcePriorityRegistry";

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
  maxFeaturesPerSource?: number;
  maxFeaturesTotal?: number;
  /** Optional roles used to order a single request per provider by source policy. */
  priorityRoles?: SourcePriorityRole[];
}

export interface PrioritySourceLoadOptions extends SourceLoadOptions {
  /** Continue through secondary and fallback providers even when a primary returns data. */
  includeSecondary?: boolean;
}

export class SourceManager {
  private readonly adapters = new Map<DataSourceKind, SourceAdapter>();
  private readonly cache = new Map<string, SourceCacheEntry>();
  private readonly states = new Map<DataSourceKind, SourceSyncState>();

  constructor(private readonly dataSourceEngine?: DataSourceEngine) {}

  register(adapter: SourceAdapter): this {
    this.adapters.set(adapter.source, adapter);
    this.states.set(adapter.source, {
      source: adapter.source,
      status: "not-configured",
      updatedAt: null,
      version: adapter.version,
      featureCount: 0,
      cacheHit: false,
      errorMessage: null,
    });

    return this;
  }

  async loadAll(bounds: BoundingBox, options: SourceLoadOptions = {}): Promise<SourceAdapterResult[]> {
    const adapters = this.dataSourceEngine
      ? this.dataSourceEngine.registry.list().map((source) => ({
          source: source.id,
          version: source.version,
        }))
      : Array.from(this.adapters.values());
    const orderedAdapters = options.priorityRoles?.length
      ? [...adapters].sort((left, right) =>
          getPriorityRank(left.source, options.priorityRoles!) -
          getPriorityRank(right.source, options.priorityRoles!)
        )
      : adapters;
    const results: SourceAdapterResult[] = [];
    let totalFeatureCount = 0;

    for (const adapter of orderedAdapters) {
      options.onSourceStart?.({
        source: adapter.source,
        label: adapter.source,
        status: "loading",
        featureCount: 0,
        errorMessage: null,
      });

      const result = await this.loadSource(adapter.source, bounds);
      const state = this.states.get(adapter.source);

      if (
        typeof options.maxFeaturesPerSource === "number" &&
        result.features.length > options.maxFeaturesPerSource
      ) {
        throw new Error(
          `Источник ${adapter.source} вернул ${result.features.length.toLocaleString("ru-RU")} объектов. ` +
            `Безопасный предел — ${options.maxFeaturesPerSource.toLocaleString("ru-RU")}. Уменьшите территорию.`
        );
      }

      totalFeatureCount += result.features.length;
      if (
        typeof options.maxFeaturesTotal === "number" &&
        totalFeatureCount > options.maxFeaturesTotal
      ) {
        throw new Error(
          `Источники вернули более ${options.maxFeaturesTotal.toLocaleString("ru-RU")} объектов. ` +
            "Уменьшите территорию или отключите необязательные источники."
        );
      }

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

  /**
   * Loads registered adapters in the central Primary → Secondary → Fallback order.
   * Providers are not unioned here: every result remains an independent feature
   * collection and can be chunked/rendered by the import pipeline.
   */
  async loadByPriority(
    role: SourcePriorityRole,
    bounds: BoundingBox,
    options: PrioritySourceLoadOptions = {}
  ): Promise<SourceAdapterResult[]> {
    const available = this.dataSourceEngine
      ? this.dataSourceEngine.registry.list().map((source) => source.id)
      : Array.from(this.adapters.keys());
    const plan = getSourcePriorityPlan(role);
    const sourceIds = getRegisteredSourceIds(role, available);
    const results: SourceAdapterResult[] = [];
    let primaryHasData = false;
    let totalFeatureCount = 0;

    for (const source of sourceIds) {
      const priority = plan.find((item) => item.id === source)?.priority ?? "fallback";
      options.onSourceStart?.({
        source,
        label: source,
        status: "loading",
        featureCount: 0,
        errorMessage: null,
      });

      const result = await this.loadSource(source, bounds);
      const state = this.states.get(source);
      const hasData = result.features.length > 0;

      if (
        typeof options.maxFeaturesPerSource === "number" &&
        result.features.length > options.maxFeaturesPerSource
      ) {
        throw new Error(
          `Источник ${source} вернул ${result.features.length.toLocaleString("ru-RU")} объектов. ` +
            `Безопасный предел — ${options.maxFeaturesPerSource.toLocaleString("ru-RU")}. Уменьшите территорию.`
        );
      }

      totalFeatureCount += result.features.length;
      if (
        typeof options.maxFeaturesTotal === "number" &&
        totalFeatureCount > options.maxFeaturesTotal
      ) {
        throw new Error(
          `Источники вернули более ${options.maxFeaturesTotal.toLocaleString("ru-RU")} объектов. ` +
            "Уменьшите территорию или отключите необязательные источники."
        );
      }

      if (priority === "primary" && hasData) primaryHasData = true;

      const enrichedResult: SourceAdapterResult = {
        ...result,
        metadata: {
          ...result.metadata,
          priority,
          fallbackUsed: priority !== "primary" && !primaryHasData,
        },
      };

      options.onSourceComplete?.({
        source,
        label: source,
        status: state?.status ?? "ready",
        featureCount: enrichedResult.features.length,
        errorMessage: state?.errorMessage ?? null,
      });

      results.push(enrichedResult);
      if (options.includeSecondary === false && priority === "primary" && hasData) break;
    }

    return results;
  }

  async loadSource(source: DataSourceKind, bounds: BoundingBox): Promise<SourceAdapterResult> {
    if (this.dataSourceEngine) {
      return this.loadSourceViaEngine(source, bounds);
    }

    const adapter = this.adapters.get(source);

    if (!adapter) {
      throw new Error(`Source adapter "${source}" is not registered.`);
    }

    const cacheKey = this.createCacheKey(source, bounds);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      const cachedStatus = resolveResultStatus(cached.result);

      this.states.set(source, {
        source,
        status: cachedStatus,
        updatedAt: cached.cachedAt,
        version: adapter.version,
        featureCount: cached.result.features.length,
        cacheHit: true,
        errorMessage: typeof cached.result.metadata?.message === "string" ? cached.result.metadata.message : null,
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
      const resultStatus = resolveResultStatus(result);

      this.cache.set(cacheKey, {
        cacheKey,
        result,
        cachedAt,
      });

      this.states.set(source, {
        source,
        status: resultStatus,
        updatedAt: cachedAt,
        version: result.version,
        featureCount: result.features.length,
        cacheHit: false,
        errorMessage: typeof result.metadata?.message === "string" ? result.metadata.message : null,
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
      this.dataSourceEngine?.clearCache();
      return;
    }

    Array.from(this.cache.keys())
      .filter((key) => key.startsWith(`${source}:`))
      .forEach((key) => this.cache.delete(key));
    this.dataSourceEngine?.clearCache(source);
  }

  getStates(): SourceSyncState[] {
    return Array.from(this.states.values());
  }

  private createCacheKey(source: DataSourceKind, bounds: BoundingBox): string {
    return `${source}:${bounds.west}:${bounds.south}:${bounds.east}:${bounds.north}`;
  }

  private async loadSourceViaEngine(source: DataSourceKind, bounds: BoundingBox): Promise<SourceAdapterResult> {
    this.states.set(source, {
      source,
      status: "loading",
      updatedAt: null,
      version: this.dataSourceEngine?.registry.get(source)?.version ?? "unknown",
      featureCount: 0,
      cacheHit: false,
      errorMessage: null,
    });

    const result = await this.dataSourceEngine!.fetchSource(source, { bbox: bounds });
    const cacheHit = result.metadata.cacheHit === true;

    this.states.set(source, {
      source,
      status: result.status,
      updatedAt: result.timestamp,
      version: result.adapterResult.version,
      featureCount: result.adapterResult.features.length,
      cacheHit,
      errorMessage: typeof result.metadata.message === "string" ? result.metadata.message : null,
    });

    return result.adapterResult;
  }
}

function resolveResultStatus(result: SourceAdapterResult): SourceSyncState["status"] {
  return normalizeDataSourceStatus(result.metadata?.status, result.features.length);
}

function getPriorityRank(source: DataSourceKind, roles: SourcePriorityRole[]): number {
  const ranks = roles.flatMap((role) =>
    getSourcePriorityPlan(role).map((item, index) => ({
      source: item.id,
      rank: index + (item.priority === "primary" ? 0 : item.priority === "secondary" ? 100 : 200),
    }))
  );
  return ranks.find((item) => item.source === source)?.rank ?? 10_000;
}
