import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { DataSourceKind } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";
import type { SourceAdapterResult } from "@/lib/gis-engine/fusion/types";

export type DataSourceStatus =
  | "ready"
  | "loading"
  | "not-configured"
  | "rate-limited"
  | "offline"
  | "error";

export type DataSourceMode = "online" | "offline";

export interface DataSourceAuthContext {
  apiKey?: string;
  token?: string;
  endpoint?: string;
}

export interface DataSourceFetchContext {
  bbox: BoundingBox;
  signal?: AbortSignal;
  forceRefresh?: boolean;
}

export interface DataSourceHealth {
  source: DataSourceKind;
  status: DataSourceStatus;
  checkedAt: string;
  message?: string;
}

export interface DataSourceResult {
  status: DataSourceStatus;
  source: DataSourceKind;
  bbox: BoundingBox;
  timestamp: string;
  features: FeatureCollection<Geometry, GeoJsonProperties>;
  adapterResult: SourceAdapterResult;
  metadata: Record<string, string | number | boolean>;
}

export interface DataSourceCachePolicy {
  memory: boolean;
  disk: boolean;
  ttlMs: number;
}

export interface IDataSource {
  id: DataSourceKind;
  name: string;
  mode: DataSourceMode;
  version: string;
  status: DataSourceStatus;
  supportsBBox: boolean;
  supportsTiles: boolean;
  cache: DataSourceCachePolicy;
  authenticate(context?: DataSourceAuthContext): Promise<DataSourceStatus>;
  healthCheck(): Promise<DataSourceHealth>;
  fetch(context: DataSourceFetchContext): Promise<DataSourceResult>;
  import(context: DataSourceFetchContext): Promise<DataSourceResult>;
  clearCache?(): Promise<void> | void;
}

export interface DataSourceEngineImportOptions {
  sources: DataSourceKind[];
  bbox: BoundingBox;
  signal?: AbortSignal;
  forceRefresh?: boolean;
  onSourceStart?: (event: DataSourceHealth) => void;
  onSourceComplete?: (result: DataSourceResult) => void;
}

export interface DataSourceEngineImportResult {
  bbox: BoundingBox;
  timestamp: string;
  results: DataSourceResult[];
  sourceStates: DataSourceHealth[];
}
