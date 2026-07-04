import { buildFormiqProjectData, getCachedAnalysisResult } from "@/lib";
import type { GISLayer } from "@/types/gis";
import type { TerritorySelection } from "@/store/selection";

export interface TerritoryAnalysisReport {
  selectedAreaSqM: number;
  loadedFeatureCount: number;
  buildingsCount: number;
  buildingFootprintSqM: number;
  roadLengthM: number;
  greenAreaSqM: number;
  waterAreaSqM: number;
}

export function analyzeTerritory(
  selection: TerritorySelection | null,
  layers: GISLayer[]
): TerritoryAnalysisReport {
  const project = buildFormiqProjectData(layers, undefined, selection?.bounds);
  const result = getCachedAnalysisResult(project);

  return {
    selectedAreaSqM: result?.territory.area ?? 0,
    loadedFeatureCount:
      project.buildings.length +
      project.roads.length +
      project.vegetation.length +
      project.water.length +
      project.terrain.length,
    buildingsCount: result?.buildings.count ?? project.buildings.length,
    buildingFootprintSqM: result?.buildings.footprintArea ?? 0,
    roadLengthM: result?.roads.totalLength ?? 0,
    greenAreaSqM: result?.vegetation.area ?? 0,
    waterAreaSqM: result?.water.area ?? 0,
  };
}

export function formatArea(valueSqM: number): string {
  if (valueSqM >= 1_000_000) {
    return `${(valueSqM / 1_000_000).toFixed(2)} км²`;
  }

  return `${Math.round(valueSqM).toLocaleString("ru-RU")} м²`;
}

export function formatLength(valueM: number): string {
  if (valueM >= 1_000) {
    return `${(valueM / 1_000).toFixed(2)} км`;
  }

  return `${Math.round(valueM).toLocaleString("ru-RU")} м`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value)}%`;
}
