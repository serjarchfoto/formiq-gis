import type { AnalysisResult } from "@/lib/gis-engine/analysis";
import type { ThematicMapDefinition } from "@/lib/gis-engine/thematic";
import type { MetricItem } from "@/features/analysis/model";
import type { AnalysisLayerDefinition, AnalysisMetricDefinition, AnalysisProvenanceQuality } from "./types";

type AnalysisModel = ReturnType<typeof import("@/features/analysis/model").buildAnalysisModel>;

export interface AnalysisMetricViewModel extends MetricItem {
  dataStatus: AnalysisLayerDefinition["status"];
  state: "ready" | "no-data" | "unsupported";
  quality: AnalysisProvenanceQuality;
  source: string;
  range?: { min: number; max: number };
}

export interface AnalysisLegendViewModel {
  title: string;
  description: string;
  state: "ready" | "no-data" | "unsupported";
  quality: AnalysisProvenanceQuality;
  categories: Array<{ key: string; label: string; color: string; count?: number }>;
}

export function createAnalysisMetricViewModels(
  definition: AnalysisLayerDefinition,
  analysis: AnalysisResult,
  model: AnalysisModel
): AnalysisMetricViewModel[] {
  const state = definition.status === "unsupported"
    ? "unsupported"
    : hasAnalysisLayerData(definition, analysis)
      ? "ready"
      : "no-data";
  return definition.metrics.map((metric) => createMetricViewModel(metric, definition, analysis, model, state));
}

export function createAnalysisLegendViewModel(
  definition: AnalysisLayerDefinition,
  thematicMap: ThematicMapDefinition | null
): AnalysisLegendViewModel {
  const categories = definition.legend.source === "thematic-map"
    ? (thematicMap?.legend ?? []).map((item) => ({ ...item }))
    : (definition.legend.items ?? []).map((item) => ({ ...item }));
  const hasLegendData = definition.legend.source === "thematic-map"
    ? Boolean(thematicMap && thematicMap.geojson.features.length > 0)
    : categories.length > 0;
  const state = definition.status === "unsupported"
    ? "unsupported"
    : hasLegendData
      ? "ready"
      : "no-data";

  return {
    title: definition.title,
    description: definition.description,
    state,
    quality: definition.provenance.quality,
    categories,
  };
}

function createMetricViewModel(
  metric: AnalysisMetricDefinition,
  definition: AnalysisLayerDefinition,
  analysis: AnalysisResult,
  model: AnalysisModel,
  state: AnalysisMetricViewModel["state"]
): AnalysisMetricViewModel {
  const modelMetricId = metric.source.startsWith("model.") ? metric.source.slice("model.".length) : null;
  const current = modelMetricId ? model.metricsById[modelMetricId] : null;
  const numericValue = current ? readModelNumericValue(metric.source, model) : readAnalysisValue(metric.source, analysis);
  const range = metric.range;

  return {
    id: metric.id,
    label: metric.title,
    value: current?.value ?? formatMetricValue(numericValue, metric.format),
    detail: metric.description,
    tone: current?.tone ?? "neutral",
    score: current?.score ?? (range ? normalizeScore(numericValue, range) : numericValue > 0 ? 100 : 0),
    delta: current?.delta,
    unit: metric.unit ?? current?.unit,
    dataStatus: definition.status,
    state,
    quality: metric.quality ?? definition.provenance.quality,
    source: definition.provenance.source,
    range,
  };
}

function hasAnalysisLayerData(definition: AnalysisLayerDefinition, analysis: AnalysisResult): boolean {
  if (
    definition.id === "floor-count" ||
    definition.id === "building-age" ||
    definition.id === "building-function" ||
    definition.id === "built-density"
  ) return analysis.buildings.count > 0;
  if (definition.id === "roads") return analysis.roads.roadTheme.length > 0;
  if (definition.id === "greenery") return analysis.vegetation.vegetationTheme.length > 0;
  if (definition.id === "water") return analysis.water.waterTheme.length > 0;
  if (definition.id === "poi-transit") {
    return analysis.territory.poiCount + analysis.territory.transitStopCount > 0;
  }
  if (definition.id === "terrain") {
    return analysis.terrain.status === "ready" && Object.values(analysis.terrain.elevationCategories).some((count) => count > 0);
  }
  return false;
}

function readModelNumericValue(source: AnalysisMetricDefinition["source"], model: AnalysisModel): number {
  if (source === "model.far") return model.far;
  if (source === "model.gsi") return model.gsi / 100;
  if (source === "model.bcr") return model.bcr / 100;
  if (source === "model.density") return model.density * 220;
  if (source === "model.floors") return model.averageFloors;
  if (source === "model.noise") return 45 + model.noiseScore * 0.33;
  if (source === "model.insolation") return model.insolationScore / 18;
  if (source === "model.green") return model.greenPercent;
  if (source === "model.transport" || source === "model.isochrones") return model.transportScore;
  if (source === "model.charts") return model.greenPercent + model.waterPercent;
  return 0;
}

function readAnalysisValue(source: AnalysisMetricDefinition["source"], analysis: AnalysisResult): number {
  if (source === "analysis.building-count") return analysis.buildings.count;
  if (source === "analysis.max-floors") return analysis.buildings.maxLevels ?? 0;
  if (source === "analysis.road-length") return analysis.roads.totalLength;
  if (source === "analysis.road-density") return analysis.roads.networkDensity;
  if (source === "analysis.green-area") return analysis.vegetation.area;
  if (source === "analysis.green-share") return analysis.vegetation.territoryPercent;
  if (source === "analysis.water-area") return analysis.water.area;
  if (source === "analysis.water-share") return analysis.water.territoryPercent;
  if (source === "analysis.poi-count") return analysis.territory.poiCount;
  if (source === "analysis.transit-count") return analysis.territory.transitStopCount;
  if (source === "analysis.terrain-samples") {
    return Object.values(analysis.terrain.elevationCategories).reduce((total, count) => total + count, 0);
  }
  return 0;
}

function formatMetricValue(value: number, format: AnalysisMetricDefinition["format"]): string {
  if (format === "percent") return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
  if (format === "area") {
    return value >= 1_000_000
      ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value / 1_000_000)} км²`
      : `${Math.round(value).toLocaleString("ru-RU")} м²`;
  }
  if (format === "length") {
    return value >= 1_000
      ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value / 1_000)} км`
      : `${Math.round(value).toLocaleString("ru-RU")} м`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: format === "decimal" ? 2 : 0 }).format(value);
}

function normalizeScore(value: number, range: { min: number; max: number }): number {
  if (range.max <= range.min) return 0;
  return Math.min(100, Math.max(0, ((value - range.min) / (range.max - range.min)) * 100));
}
