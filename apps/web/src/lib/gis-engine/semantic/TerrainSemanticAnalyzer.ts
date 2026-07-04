import type { FormiqTerrain, TerrainSemantic } from "@/types/formiq";

export class TerrainSemanticAnalyzer {
  analyze(_terrain: FormiqTerrain): TerrainSemantic {
    void _terrain;

    return {
      slopeCategory: "unknown",
      elevationCategory: "unknown",
      importance: "unknown",
      colorGroup: "terrain",
    };
  }
}
