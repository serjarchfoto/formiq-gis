import type { FormiqWater, SemanticImportance, WaterSemantic } from "@/types/formiq";

export class WaterSemanticAnalyzer {
  analyze(water: FormiqWater): WaterSemantic {
    return {
      waterType: water.waterType ?? "unknown",
      importance: getImportance(water),
      colorGroup: "water",
    };
  }
}

function getImportance(water: FormiqWater): SemanticImportance {
  if (water.area >= 20_000) {
    return "high";
  }

  if (water.waterType) {
    return "medium";
  }

  return "unknown";
}
