import type { AnalysisCalculator, BuildingAnalysis, ThematicRenderItem } from "../types";
import type { BuildingAgeCategory } from "@/types/formiq";
import { analysisColors } from "./analysisColors";

const colors: Record<BuildingAgeCategory, string> = {
  "historic-pre-1917": analysisColors.historic,
  "soviet-early": analysisColors.soviet,
  "soviet-mid": analysisColors.soviet,
  "soviet-late": analysisColors.soviet,
  "post-soviet": analysisColors.postSoviet,
  contemporary: analysisColors.contemporary,
  unknown: analysisColors.unknown,
};

export class AgeCalculator implements AnalysisCalculator<"buildings"> {
  key = "buildings" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"buildings">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"buildings">["calculate"]>[1]
  ): BuildingAnalysis {
    const buildings = partialResult.buildings;

    if (!buildings) {
      throw new Error("AgeCalculator requires BuildingCalculator to run first.");
    }

    const ageDistribution = { ...buildings.ageDistribution };
    const ageTheme: ThematicRenderItem[] = project.buildings.map((building) => {
      const category = building.semantic.ageCategory;
      ageDistribution[category] += 1;

      return {
        objectId: building.id,
        category,
        legendGroup: `age:${category}`,
        renderColor: colors[category],
      };
    });

    return {
      ...buildings,
      ageDistribution,
      ageTheme,
    };
  }
}
