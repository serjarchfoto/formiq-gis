import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { DataSourceKind } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";
import type { SourceAdapter, SourceAdapterResult, SourceFeature } from "@/lib/gis-engine/fusion/types";
import { normalizeDataSourceStatus } from "./status";
import type {
  DataSourceCachePolicy,
  DataSourceFetchContext,
  DataSourceHealth,
  DataSourceMode,
  DataSourceResult,
  DataSourceStatus,
  IDataSource,
} from "./types";

interface SourceAdapterDataSourceOptions {
  name: string;
  mode: DataSourceMode;
  supportsBBox?: boolean;
  supportsTiles?: boolean;
  cache?: Partial<DataSourceCachePolicy>;
}

const DEFAULT_CACHE_POLICY: DataSourceCachePolicy = {
  memory: true,
  disk: true,
  ttlMs: 5 * 60 * 1000,
};

export class SourceAdapterDataSource implements IDataSource {
  readonly id: DataSourceKind;
  readonly version: string;
  readonly supportsBBox: boolean;
  readonly supportsTiles: boolean;
  readonly cache: DataSourceCachePolicy;
  status: DataSourceStatus = "not-configured";

  constructor(
    private readonly adapter: SourceAdapter,
    readonly name: string,
    readonly mode: DataSourceMode,
    options: Omit<SourceAdapterDataSourceOptions, "name" | "mode"> = {}
  ) {
    this.id = adapter.source;
    this.version = adapter.version;
    this.supportsBBox = options.supportsBBox ?? true;
    this.supportsTiles = options.supportsTiles ?? false;
    this.cache = {
      ...DEFAULT_CACHE_POLICY,
      ...options.cache,
    };
  }

  async authenticate(): Promise<DataSourceStatus> {
    this.status = "ready";
    return this.status;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    return {
      source: this.id,
      status: this.status === "not-configured" ? "ready" : this.status,
      checkedAt: new Date().toISOString(),
    };
  }

  async fetch(context: DataSourceFetchContext): Promise<DataSourceResult> {
    return this.import(context);
  }

  async import(context: DataSourceFetchContext): Promise<DataSourceResult> {
    this.status = "loading";

    try {
      const adapterResult = await this.adapter.fetch({ bounds: context.bbox });
      const status = normalizeDataSourceStatus(adapterResult.metadata?.status, adapterResult.features.length);
      this.status = status;

      return toDataSourceResult(adapterResult, context.bbox, status);
    } catch (error) {
      const adapterResult: SourceAdapterResult = {
        source: this.id,
        version: this.version,
        features: [],
        metadata: {
          status: "error",
          message: error instanceof Error ? error.message : "Data source import failed.",
        },
      };

      this.status = "error";
      return toDataSourceResult(adapterResult, context.bbox, "error");
    }
  }
}

export class UnavailableDataSource implements IDataSource {
  readonly version = "not-configured";
  readonly status: DataSourceStatus = "not-configured";
  readonly supportsBBox = false;
  readonly supportsTiles = false;
  readonly cache: DataSourceCachePolicy = {
    memory: false,
    disk: false,
    ttlMs: 0,
  };

  constructor(
    readonly id: DataSourceKind,
    readonly name: string,
    readonly mode: DataSourceMode = "online"
  ) {}

  async authenticate(): Promise<DataSourceStatus> {
    return "not-configured";
  }

  async healthCheck(): Promise<DataSourceHealth> {
    return {
      source: this.id,
      status: "not-configured",
      checkedAt: new Date().toISOString(),
      message: `${this.name} adapter is not configured.`,
    };
  }

  async fetch(context: DataSourceFetchContext): Promise<DataSourceResult> {
    return this.import(context);
  }

  async import(context: DataSourceFetchContext): Promise<DataSourceResult> {
    const adapterResult: SourceAdapterResult = {
      source: this.id,
      version: this.version,
      features: [],
      metadata: {
        status: "not-configured",
        message: `${this.name} adapter is not configured.`,
      },
    };

    return toDataSourceResult(adapterResult, context.bbox, "not-configured");
  }
}

function toDataSourceResult(
  adapterResult: SourceAdapterResult,
  bbox: BoundingBox,
  status: DataSourceStatus
): DataSourceResult {
  return {
    status,
    source: adapterResult.source,
    bbox,
    timestamp: new Date().toISOString(),
    features: toFeatureCollection(adapterResult.features),
    adapterResult: {
      ...adapterResult,
      metadata: {
        ...(adapterResult.metadata ?? {}),
        status,
      },
    },
    metadata: {
      ...(adapterResult.metadata ?? {}),
      status,
      featureCount: adapterResult.features.length,
    },
  };
}

function toFeatureCollection(features: SourceFeature[]): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: features.map<Feature<Geometry, GeoJsonProperties>>((feature) => ({
      type: "Feature",
      id: feature.sourceFeatureId,
      geometry: feature.geometry,
      properties: {
        ...feature.tags,
        "_formiq:source": feature.source,
        "_formiq:kind": feature.kind,
        "_formiq:sourceFeatureId": feature.sourceFeatureId,
      },
    })),
  };
}
