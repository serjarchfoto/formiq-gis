import type { ThematicMapType } from "@/lib/gis-engine/thematic";
import { analysisLayers } from "./analysisLayers";
import type { AnalysisLayerDefinition, AnalysisLayerId } from "./types";

export const DEFAULT_ANALYSIS_LAYER_ID: AnalysisLayerId = "built-density";

const layerById = new Map<AnalysisLayerId, AnalysisLayerDefinition>(
  analysisLayers.map((layer) => [layer.id, layer])
);

const legacyLayerAliases: Readonly<Record<string, AnalysisLayerId>> = {
  far: "built-density",
  gsi: "built-density",
  density: "built-density",
  green: "greenery",
  transport: "poi-transit",
  insolation: "sun-shadows",
};

export function normalizeAnalysisLayerId(id: string | null | undefined): AnalysisLayerId {
  if (!id) return DEFAULT_ANALYSIS_LAYER_ID;
  const normalized = legacyLayerAliases[id] ?? id;
  return layerById.has(normalized as AnalysisLayerId)
    ? (normalized as AnalysisLayerId)
    : DEFAULT_ANALYSIS_LAYER_ID;
}

export function getAnalysisLayerDefinition(id: string | null | undefined): AnalysisLayerDefinition {
  return layerById.get(normalizeAnalysisLayerId(id)) ?? layerById.get(DEFAULT_ANALYSIS_LAYER_ID)!;
}

export function getThematicMapTypeForAnalysisLayer(id: string | null | undefined): ThematicMapType {
  if (id === "scenarios") return "none";
  return getAnalysisLayerDefinition(id).thematicMapType ?? "none";
}

export function getReadyAnalysisLayers(): AnalysisLayerDefinition[] {
  return analysisLayers.filter((layer) => layer.navigationGroup === "ready");
}

export function getReservedAnalysisLayers(): AnalysisLayerDefinition[] {
  return analysisLayers.filter((layer) => layer.navigationGroup === "development");
}
