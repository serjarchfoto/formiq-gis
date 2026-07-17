import type { ThematicMapType } from "@/lib/gis-engine/thematic";

export type ReadyAnalysisLayerId =
  | "floor-count"
  | "building-age"
  | "building-function"
  | "built-density"
  | "roads"
  | "greenery"
  | "water"
  | "poi-transit"
  | "terrain";

export type ReservedAnalysisLayerId =
  | "population-density"
  | "transit-accessibility"
  | "elevation-analysis"
  | "functional-zoning"
  | "sun-shadows"
  | "noise"
  | "wind"
  | "visibility"
  | "social-infrastructure"
  | "pedestrian-accessibility"
  | "suitability";

export type AnalysisLayerId = ReadyAnalysisLayerId | ReservedAnalysisLayerId;
export type AnalysisLayerCategory =
  | "buildings"
  | "mobility"
  | "landscape"
  | "environment"
  | "demography"
  | "planning"
  | "composite";

export type AnalysisDataStatus =
  | "verified"
  | "derived"
  | "heuristic"
  | "demo"
  | "partial"
  | "no-data"
  | "unsupported";

export type AnalysisProvenanceQuality = "verified" | "derived" | "heuristic" | "demo" | "unknown";
export type AnalysisVisualizationType = "fill" | "line" | "symbol" | "heatmap" | "extrusion" | "raster";
export type AnalysisLayerIconId =
  | "blocks"
  | "building"
  | "chart"
  | "grid"
  | "layers"
  | "map"
  | "noise"
  | "sun"
  | "transport";

export type AnalysisMetricSource =
  | "model.far"
  | "model.gsi"
  | "model.bcr"
  | "model.density"
  | "model.floors"
  | "model.noise"
  | "model.insolation"
  | "model.green"
  | "model.transport"
  | "model.isochrones"
  | "model.charts"
  | "analysis.building-count"
  | "analysis.max-floors"
  | "analysis.road-length"
  | "analysis.road-density"
  | "analysis.green-area"
  | "analysis.green-share"
  | "analysis.water-area"
  | "analysis.water-share"
  | "analysis.poi-count"
  | "analysis.transit-count"
  | "analysis.terrain-samples";

export type AnalysisMetricFormat = "number" | "decimal" | "percent" | "area" | "length";

export interface AnalysisMetricDefinition {
  id: string;
  title: string;
  description: string;
  unit?: string;
  source: AnalysisMetricSource;
  format?: AnalysisMetricFormat;
  range?: { min: number; max: number };
  quality?: AnalysisProvenanceQuality;
}

export interface AnalysisFilterDefinition {
  id: string;
  title: string;
  type: "select" | "multi-select" | "range" | "toggle";
  options?: ReadonlyArray<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface AnalysisLayerDefinition {
  id: AnalysisLayerId;
  title: string;
  shortTitle: string;
  description: string;
  category: AnalysisLayerCategory;
  status: AnalysisDataStatus;
  navigationGroup: "ready" | "development";
  icon: AnalysisLayerIconId;
  thematicMapType?: ThematicMapType;
  calculatorId?: string;
  visualization: {
    type: AnalysisVisualizationType;
    supports2D: boolean;
    supports3D: boolean;
    supportsComparison: boolean;
    supportsScenarios: boolean;
  };
  metrics: ReadonlyArray<AnalysisMetricDefinition>;
  filters: ReadonlyArray<AnalysisFilterDefinition>;
  legend: {
    source: "thematic-map" | "static" | "calculated";
    items?: ReadonlyArray<{ key: string; label: string; color: string }>;
  };
  provenance: {
    source: string;
    quality: AnalysisProvenanceQuality;
    description?: string;
  };
}
