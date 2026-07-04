import type { AnalysisCalculator, BuildingAnalysis, ThematicRenderItem } from "../types";
import type { BuildingFunctionCategory } from "@/types/formiq";
import { analysisColors } from "./analysisColors";

const colors: Record<BuildingFunctionCategory, string> = {
  residential: analysisColors.residential,
  commercial: analysisColors.commercial,
  industrial: analysisColors.industrial,
  public: analysisColors.public,
  education: analysisColors.education,
  healthcare: analysisColors.healthcare,
  religious: analysisColors.religious,
  sports: analysisColors.sports,
  mixed: analysisColors.public,
  unknown: analysisColors.unknown,
};

export class FunctionCalculator implements AnalysisCalculator<"buildings"> {
  key = "buildings" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"buildings">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"buildings">["calculate"]>[1]
  ): BuildingAnalysis {
    const buildings = partialResult.buildings;

    if (!buildings) {
      throw new Error("FunctionCalculator requires BuildingCalculator to run first.");
    }

    const functionDistribution = { ...buildings.functionDistribution };
    const functionTheme: ThematicRenderItem[] = project.buildings.map((building) => {
      const category = building.semantic.functionCategory;
      functionDistribution[category] += 1;

      return {
        objectId: building.id,
        category,
        legendGroup: `function:${category}`,
        renderColor: colors[category],
      };
    });

    return {
      ...buildings,
      functionDistribution,
      functionTheme,
    };
  }
}
