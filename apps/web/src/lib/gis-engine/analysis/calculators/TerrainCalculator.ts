import type { AnalysisCalculator, TerrainAnalysis } from "../types";

export class TerrainCalculator implements AnalysisCalculator<"terrain"> {
  key = "terrain" as const;

  calculate(): TerrainAnalysis {
    return {
      status: "not-available",
      slopeCategories: {},
      elevationCategories: {},
    };
  }
}
