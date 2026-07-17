import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { BoundingBox, GISLayerCategory, GISLayerGeometryType } from "@/types/gis";
import type { DataSourceKind } from "@/types/formiq";

export type LayerChunkType = Exclude<GISLayerCategory, "custom">;
export type TerritoryImportPhase =
  | "idle"
  | "downloading"
  | "processing"
  | "persisting"
  | "rendering"
  | "completed"
  | "cancelled"
  | "error";
export type ImportGridCellStatus = "queued" | "downloading" | "processing" | "persisting" | "ready" | "error" | "cancelled";

export interface ImportGridCell {
  id: string;
  tileId: string;
  bounds: BoundingBox;
  row: number;
  column: number;
  status: ImportGridCellStatus;
  attempts: number;
  error: string | null;
}

export interface LayerChunkManifest {
  id: string;
  projectId: string;
  layerType: LayerChunkType;
  geometryType: GISLayerGeometryType;
  tileId: string;
  sequence: number;
  sourceIds: DataSourceKind[];
  featureCount: number;
  byteSize: number;
  bbox: BoundingBox | null;
  contentHash: string;
  createdAt: string;
}

export interface LayerChunkRecord extends LayerChunkManifest {
  geojson: FeatureCollection<Geometry, GeoJsonProperties>;
}

export interface TerritoryImportProgress {
  phase: TerritoryImportPhase;
  completedCells: number;
  totalCells: number;
  downloadedSources: number;
  totalSourceRequests: number;
  persistedChunks: number;
  renderedChunks: number;
  totalChunks: number;
  percent: number;
}

export interface ChunkProcessingRequest {
  requestId: string;
  sessionId: string;
  projectId: string;
  tileId: string;
  source: DataSourceKind;
  payload: import("@/lib/gis-engine/fusion/types").SourceAdapterWorkerPayload;
}

export interface ChunkProcessingResult {
  requestId: string;
  chunks: LayerChunkRecord[];
  /** Normalized features retained for the canonical project-model fusion step. */
  features: import("@/lib/gis-engine/fusion/types").SourceFeature[];
  duplicateCount: number;
  processingDurationMs: number;
  deduplicationDurationMs: number;
}

export interface ChunkedImportManifest {
  version: 1;
  bounds: BoundingBox;
  chunkIds: string[];
  featureCounts: Partial<Record<LayerChunkType, number>>;
  completedAt: string;
  /** Reserved for a future server-side MVT provider; GeoJSON chunks are canonical today. */
  vectorTileUrlTemplate?: string;
}
