import type { BuildingAnalysis, AnalysisCalculator, ThematicRenderItem } from "../types";
import type {
  BuildingAgeCategory,
  BuildingFunctionCategory,
  BuildingHeightCategory,
} from "@/types/formiq";

const emptyFloorDistribution: Record<BuildingHeightCategory, number> = {
  low: 0,
  mid: 0,
  high: 0,
  "very-high": 0,
  unknown: 0,
};

const emptyAgeDistribution: Record<BuildingAgeCategory, number> = {
  "historic-pre-1917": 0,
  "soviet-early": 0,
  "soviet-mid": 0,
  "soviet-late": 0,
  "post-soviet": 0,
  contemporary: 0,
  unknown: 0,
};

const emptyFunctionDistribution: Record<BuildingFunctionCategory, number> = {
  residential: 0,
  commercial: 0,
  industrial: 0,
  public: 0,
  education: 0,
  healthcare: 0,
  religious: 0,
  sports: 0,
  mixed: 0,
  unknown: 0,
};

export class BuildingCalculator implements AnalysisCalculator<"buildings"> {
  key = "buildings" as const;

  calculate({ project }: Parameters<AnalysisCalculator<"buildings">["calculate"]>[0]): BuildingAnalysis {
    const knownLevels = project.buildings
      .map((building) => building.levels)
      .filter((levels): levels is number => levels != null);
    const footprintArea = project.buildings.reduce((total, building) => total + building.area, 0);
    const totalFloorArea = project.buildings.reduce(
      (total, building) => total + building.area * (building.levels ?? 1),
      0
    );

    return {
      count: project.buildings.length,
      footprintArea,
      footprintPercent: 0,
      totalFloorArea,
      averageLevels: knownLevels.length
        ? knownLevels.reduce((total, levels) => total + levels, 0) / knownLevels.length
        : null,
      maxLevels: knownLevels.length ? Math.max(...knownLevels) : null,
      floorDistribution: { ...emptyFloorDistribution },
      ageDistribution: { ...emptyAgeDistribution },
      functionDistribution: { ...emptyFunctionDistribution },
      floorTheme: [] satisfies ThematicRenderItem[],
      ageTheme: [] satisfies ThematicRenderItem[],
      functionTheme: [] satisfies ThematicRenderItem[],
    };
  }
}
