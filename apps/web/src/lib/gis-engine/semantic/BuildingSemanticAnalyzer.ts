import type {
  BuildingAgeCategory,
  BuildingFunctionCategory,
  BuildingHeightCategory,
  BuildingSemantic,
  DensityCategory,
  FormiqBuilding,
  SemanticColorGroup,
  SemanticImportance,
} from "@/types/formiq";

export class BuildingSemanticAnalyzer {
  analyze(building: FormiqBuilding): BuildingSemantic {
    const heightCategory = getHeightCategory(building);
    const ageCategory = getAgeCategory(building.year);
    const functionCategory = getFunctionCategory(building);
    const densityCategory = getDensityCategory(building.area);
    const isPublic = isPublicFunction(functionCategory);
    const isResidential = functionCategory === "residential";

    return {
      heightCategory,
      ageCategory,
      functionCategory,
      densityCategory,
      importance: getImportance(functionCategory, building.area),
      colorGroup: getColorGroup(heightCategory),
      transportRelation: "unknown",
      greenRelation: "unknown",
      isHistoric: ageCategory === "historic-pre-1917",
      isPublic,
      isResidential,
    };
  }
}

function getHeightCategory(building: FormiqBuilding): BuildingHeightCategory {
  if (building.levels == null && building.height == null) {
    return "unknown";
  }

  const levels = building.levels ?? (building.height != null ? building.height / 3 : null);

  if (levels == null) {
    return "unknown";
  }

  if (levels <= 3) {
    return "low";
  }

  if (levels <= 8) {
    return "mid";
  }

  if (levels <= 20) {
    return "high";
  }

  return "very-high";
}

function getAgeCategory(year: number | null): BuildingAgeCategory {
  if (year == null) {
    return "unknown";
  }

  if (year < 1917) {
    return "historic-pre-1917";
  }

  if (year <= 1945) {
    return "soviet-early";
  }

  if (year <= 1970) {
    return "soviet-mid";
  }

  if (year <= 1990) {
    return "soviet-late";
  }

  if (year <= 2010) {
    return "post-soviet";
  }

  return "contemporary";
}

function getFunctionCategory(building: FormiqBuilding): BuildingFunctionCategory {
  if (building.usage === "unknown") {
    return "unknown";
  }

  return building.usage;
}

function getDensityCategory(area: number): DensityCategory {
  if (!Number.isFinite(area) || area <= 0) {
    return "unknown";
  }

  if (area < 250) {
    return "small-footprint";
  }

  if (area < 1_500) {
    return "medium-footprint";
  }

  return "large-footprint";
}

function getImportance(functionCategory: BuildingFunctionCategory, area: number): SemanticImportance {
  if (["education", "healthcare", "public"].includes(functionCategory)) {
    return "high";
  }

  if (["religious", "sports"].includes(functionCategory)) {
    return "medium";
  }

  if (area >= 5_000) {
    return "medium";
  }

  if (functionCategory === "unknown") {
    return "unknown";
  }

  return "low";
}

function getColorGroup(heightCategory: BuildingHeightCategory): SemanticColorGroup {
  if (heightCategory === "low") {
    return "building-low";
  }

  if (heightCategory === "mid") {
    return "building-mid";
  }

  if (heightCategory === "high" || heightCategory === "very-high") {
    return "building-high";
  }

  return "unknown";
}

function isPublicFunction(functionCategory: BuildingFunctionCategory): boolean {
  return ["public", "education", "healthcare", "religious", "sports"].includes(functionCategory);
}
