import type { AnalysisCalculator, TerrainAnalysis } from "../types";

export class TerrainCalculator implements AnalysisCalculator<"terrain"> {
  key = "terrain" as const;

  calculate({ project }: Parameters<AnalysisCalculator<"terrain">["calculate"]>[0]): TerrainAnalysis {
    if (project.terrain.length === 0) {
      return {
        status: "not-available",
        slopeCategories: {},
        elevationCategories: {},
        minElevation: null,
        maxElevation: null,
        averageElevation: null,
        coveragePercent: 0,
        reason: project.importSettings.includeTerrain
          ? "DEM не вернул точки высот для выбранной территории."
          : "Рельеф не импортирован: включите источник DEM в настройках импорта.",
      };
    }

    const elevations = project.terrain
      .map((terrain) => terrain.elevation)
      .filter((elevation): elevation is number => typeof elevation === "number" && Number.isFinite(elevation));
    const slopes = project.terrain
      .map((terrain) => terrain.slope)
      .filter((slope): slope is number => typeof slope === "number" && Number.isFinite(slope));

    return {
      status: "ready",
      slopeCategories: project.terrain.reduce<Record<string, number>>((result, terrain) => {
        const key = terrain.semantic.slopeCategory;
        result[key] = (result[key] ?? 0) + 1;
        return result;
      }, {}),
      elevationCategories: project.terrain.reduce<Record<string, number>>((result, terrain) => {
        const key = terrain.semantic.elevationCategory;
        result[key] = (result[key] ?? 0) + 1;
        return result;
      }, {}),
      minElevation: elevations.length ? Math.min(...elevations) : null,
      maxElevation: elevations.length ? Math.max(...elevations) : null,
      averageElevation: elevations.length ? elevations.reduce((sum, value) => sum + value, 0) / elevations.length : null,
      coveragePercent: Math.min(100, (elevations.length / Math.max(project.terrain.length, 1)) * 100),
      reason: slopes.length < project.terrain.length ? "Часть точек DEM не содержит уклон; высоты рассчитаны по доступным образцам." : null,
    };
  }
}
