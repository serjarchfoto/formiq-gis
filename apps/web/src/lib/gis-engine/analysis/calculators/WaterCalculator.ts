import type { AnalysisCalculator, ThematicRenderItem, WaterAnalysis } from "../types";
import { analysisColors } from "./analysisColors";

export class WaterCalculator implements AnalysisCalculator<"water"> {
  key = "water" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"water">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"water">["calculate"]>[1]
  ): WaterAnalysis {
    const area = project.water.reduce((total, water) => total + water.area, 0);
    const territoryArea = partialResult.territory?.area ?? 0;
    const waterTheme: ThematicRenderItem[] = project.water.map((water) => ({
      objectId: water.id,
      category: water.semantic.waterType,
      legendGroup: `water:${water.semantic.waterType}`,
      renderColor: analysisColors.water,
    }));

    return {
      area,
      territoryPercent: territoryArea ? (area / territoryArea) * 100 : 0,
      waterTheme,
    };
  }
}
