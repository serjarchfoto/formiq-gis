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
    const knownAge = project.buildings.filter((building) => building.year != null).length;
    const knownFunction = project.buildings.filter((building) => building.usage !== "unknown").length;
    const knownFloor = project.buildings.filter((building) => building.levels != null || building.height != null).length;
    const residentialArea = project.buildings
      .filter((building) => building.usage === "residential")
      .reduce((total, building) => total + building.area * (building.levels ?? 1), 0);
    const estimatedPopulation = residentialArea * 0.035;

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
      ageCoveragePercent: project.buildings.length ? (knownAge / project.buildings.length) * 100 : 0,
      functionCoveragePercent: project.buildings.length ? (knownFunction / project.buildings.length) * 100 : 0,
      floorCoveragePercent: project.buildings.length ? (knownFloor / project.buildings.length) * 100 : 0,
      estimatedPopulation,
      populationCoveragePercent: residentialArea > 0 ? 100 : 0,
      dataNotes: [
        knownAge < project.buildings.length ? "Возраст: часть годов постройки отсутствует в исходных данных." : "Возраст: годы постройки получены из источников.",
        knownFunction < project.buildings.length ? "Функции: неизвестные объекты сохранены как unknown." : "Функции: классификация заполнена.",
        residentialArea > 0 ? "Население: оценка по жилой площади и этажности, без официальной статистики." : "Население: нет жилых зданий для расчётной оценки.",
      ],
    };
  }
}
