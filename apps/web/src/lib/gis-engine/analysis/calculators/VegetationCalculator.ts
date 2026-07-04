import type { AnalysisCalculator, ThematicRenderItem, VegetationAnalysis } from "../types";
import type { LandscapeCategory } from "@/types/formiq";
import { analysisColors } from "./analysisColors";

const emptyCategories: Record<LandscapeCategory, number> = {
  park: 0,
  forest: 0,
  grass: 0,
  garden: 0,
  recreation: 0,
  unknown: 0,
};

export class VegetationCalculator implements AnalysisCalculator<"vegetation"> {
  key = "vegetation" as const;

  calculate(
    { project }: Parameters<AnalysisCalculator<"vegetation">["calculate"]>[0],
    partialResult: Parameters<AnalysisCalculator<"vegetation">["calculate"]>[1]
  ): VegetationAnalysis {
    const categories = { ...emptyCategories };
    const area = project.vegetation.reduce((total, vegetation) => {
      categories[vegetation.semantic.landscapeCategory] += vegetation.area;

      return total + vegetation.area;
    }, 0);
    const territoryArea = partialResult.territory?.area ?? 0;
    const vegetationTheme: ThematicRenderItem[] = project.vegetation.map((vegetation) => ({
      objectId: vegetation.id,
      category: vegetation.semantic.landscapeCategory,
      legendGroup: `vegetation:${vegetation.semantic.landscapeCategory}`,
      renderColor: analysisColors.green,
    }));

    return {
      area,
      territoryPercent: territoryArea ? (area / territoryArea) * 100 : 0,
      categories,
      vegetationTheme,
    };
  }
}
