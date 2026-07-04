import type { AnalysisCalculator, BuildingAnalysis } from "../types";

export class DensityCalculator implements AnalysisCalculator<"buildings"> {
  key = "buildings" as const;

  calculate(
    context: Parameters<AnalysisCalculator<"buildings">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"buildings">["calculate"]>[1]
  ): BuildingAnalysis {
    const buildings = partialResult.buildings;
    const territoryArea = partialResult.territory?.area ?? 0;

    if (!buildings) {
      throw new Error("DensityCalculator requires BuildingCalculator to run first.");
    }

    return {
      ...buildings,
      footprintPercent: territoryArea ? (buildings.footprintArea / territoryArea) * 100 : 0,
    };
  }
}
