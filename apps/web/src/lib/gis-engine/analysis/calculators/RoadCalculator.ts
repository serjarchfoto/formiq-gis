import type { AnalysisCalculator, RoadAnalysis, ThematicRenderItem } from "../types";
import type { RoadType } from "@/types/formiq";
import { analysisColors } from "./analysisColors";

const emptyLengthByCategory: Record<RoadType, number> = {
  motorway: 0,
  trunk: 0,
  primary: 0,
  secondary: 0,
  tertiary: 0,
  residential: 0,
  service: 0,
  pedestrian: 0,
  footway: 0,
  cycleway: 0,
  other: 0,
};

export class RoadCalculator implements AnalysisCalculator<"roads"> {
  key = "roads" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"roads">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"roads">["calculate"]>[1]
  ): RoadAnalysis {
    const lengthByCategory = { ...emptyLengthByCategory };
    const totalLength = project.roads.reduce((total, road) => {
      lengthByCategory[road.roadType] += road.length;

      return total + road.length;
    }, 0);
    const territoryArea = partialResult.territory?.area ?? 0;
    const roadTheme: ThematicRenderItem[] = project.roads.map((road) => ({
      objectId: road.id,
      category: road.semantic.transportCategory,
      legendGroup: `road:${road.semantic.transportCategory}`,
      renderColor:
        road.semantic.colorGroup === "road-primary"
          ? analysisColors.roadPrimary
          : analysisColors.roadSecondary,
    }));

    return {
      totalLength,
      lengthByCategory,
      networkDensity: territoryArea ? totalLength / (territoryArea / 1_000_000) : 0,
      roadTheme,
    };
  }
}
