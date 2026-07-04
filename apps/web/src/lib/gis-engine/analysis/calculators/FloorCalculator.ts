import type { AnalysisCalculator, BuildingAnalysis, ThematicRenderItem } from "../types";
import type { BuildingHeightCategory } from "@/types/formiq";
import { analysisColors } from "./analysisColors";

const colors: Record<BuildingHeightCategory, string> = {
  low: analysisColors.buildingLow,
  mid: analysisColors.buildingMid,
  high: analysisColors.buildingHigh,
  "very-high": analysisColors.buildingHigh,
  unknown: analysisColors.unknown,
};

export class FloorCalculator implements AnalysisCalculator<"buildings"> {
  key = "buildings" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"buildings">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"buildings">["calculate"]>[1]
  ): BuildingAnalysis {
    const buildings = partialResult.buildings;

    if (!buildings) {
      throw new Error("FloorCalculator requires BuildingCalculator to run first.");
    }

    const floorDistribution = { ...buildings.floorDistribution };
    const floorTheme: ThematicRenderItem[] = project.buildings.map((building) => {
      const category = building.semantic.heightCategory;
      floorDistribution[category] += 1;

      return {
        objectId: building.id,
        category,
        legendGroup: `floors:${category}`,
        renderColor: colors[category],
      };
    });

    return {
      ...buildings,
      floorDistribution,
      floorTheme,
    };
  }
}
