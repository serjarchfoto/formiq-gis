import type { AnalysisCalculator, TerrainAnalysis } from "../types";

export class TerrainCalculator implements AnalysisCalculator<"terrain"> {
  key = "terrain" as const;

  calculate({ project }: Parameters<AnalysisCalculator<"terrain">["calculate"]>[0]): TerrainAnalysis {
    if (project.terrain.length === 0) {
      return {
        status: "not-available",
        slopeCategories: {},
        elevationCategories: {},
      };
    }

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
    };
  }
}
