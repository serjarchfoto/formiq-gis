import type {
  FormiqVegetation,
  LandscapeCategory,
  SemanticImportance,
  TreeDensity,
  VegetationSemantic,
} from "@/types/formiq";

export class VegetationSemanticAnalyzer {
  analyze(vegetation: FormiqVegetation): VegetationSemantic {
    const landscapeCategory = getLandscapeCategory(vegetation.vegetationType);

    return {
      greenType: vegetation.vegetationType ?? "unknown",
      treeDensity: getTreeDensity(vegetation),
      landscapeCategory,
      importance: getImportance(landscapeCategory, vegetation.area),
      colorGroup: "green",
    };
  }
}

function getLandscapeCategory(value: string | null): LandscapeCategory {
  if (!value) {
    return "unknown";
  }

  if (["park", "recreation_ground", "village_green"].includes(value)) {
    return "park";
  }

  if (["forest", "wood"].includes(value)) {
    return "forest";
  }

  if (["grass", "meadow", "grassland"].includes(value)) {
    return "grass";
  }

  if (value === "garden") {
    return "garden";
  }

  if (value === "recreation_ground") {
    return "recreation";
  }

  return "unknown";
}

function getTreeDensity(vegetation: FormiqVegetation): TreeDensity {
  if (["forest", "wood"].includes(vegetation.vegetationType ?? "")) {
    return "dense";
  }

  if (["park", "garden"].includes(vegetation.vegetationType ?? "")) {
    return "medium";
  }

  if (vegetation.vegetationType) {
    return "sparse";
  }

  return "unknown";
}

function getImportance(category: LandscapeCategory, area: number): SemanticImportance {
  if (["park", "forest"].includes(category) || area >= 10_000) {
    return "high";
  }

  if (category === "unknown") {
    return "unknown";
  }

  return "medium";
}
