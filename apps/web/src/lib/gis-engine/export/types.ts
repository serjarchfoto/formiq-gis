import type { BoundingBox } from "@/types/gis";
import type { FormiqProjectData, ProjectUnits } from "@/types/formiq";

export type ExportFormat =
  | "geojson"
  | "csv"
  | "kml"
  | "dxf"
  | "obj"
  | "gltf"
  | "png"
  | "pdf"
  | "shapefile"
  | "geopackage"
  | "pmtiles"
  | "mbtiles"
  | "geoparquet";

export type ExportScope = "project" | "visible-area" | "selection" | "active-layers";
export type ExportQuality = "draft" | "standard" | "high";
export type ExportProgressStage =
  | "prepare-project"
  | "prepare-data"
  | "convert"
  | "write"
  | "create-file"
  | "done";

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  scope?: ExportScope;
  bbox?: BoundingBox;
  selectedIds?: string[];
  activeLayerIds?: string[];
  columns?: string[];
  crs?: string;
  units?: ProjectUnits;
  quality?: ExportQuality;
  resolutionScale?: 1 | 2 | 4 | 8;
  transparentBackground?: boolean;
  paperFormat?: "A4" | "A3" | "A2" | "A1" | "A0";
  orientation?: "portrait" | "landscape";
}

export interface ExportContext {
  project: FormiqProjectData;
  options: ExportOptions;
  createdAt: string;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportProgress {
  stage: ExportProgressStage;
  status: "loading" | "ready" | "error";
  message: string;
  progress: number;
}

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  data: Uint8Array;
  size: number;
  metadata: {
    featureCount: number;
    createdAt: string;
    crs: string;
    scope: ExportScope;
  };
}

export interface ExportAdapter {
  readonly format: ExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly mimeType: string;
  export(context: ExportContext): Promise<ExportResult>;
}

export interface ExportTask {
  id: string;
  context: ExportContext;
}

export interface ExportJob {
  id: string;
  status: "queued" | "running" | "done" | "error";
  task: ExportTask;
  result?: ExportResult;
  errorMessage?: string;
}
