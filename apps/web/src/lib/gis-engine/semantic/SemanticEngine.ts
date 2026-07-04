import type { FormiqLayerData } from "@/types/formiq";
import { BuildingSemanticAnalyzer } from "./BuildingSemanticAnalyzer";
import { RoadSemanticAnalyzer } from "./RoadSemanticAnalyzer";
import { TerrainSemanticAnalyzer } from "./TerrainSemanticAnalyzer";
import { VegetationSemanticAnalyzer } from "./VegetationSemanticAnalyzer";
import { WaterSemanticAnalyzer } from "./WaterSemanticAnalyzer";

export class SemanticEngine {
  constructor(
    private readonly buildingAnalyzer = new BuildingSemanticAnalyzer(),
    private readonly roadAnalyzer = new RoadSemanticAnalyzer(),
    private readonly vegetationAnalyzer = new VegetationSemanticAnalyzer(),
    private readonly waterAnalyzer = new WaterSemanticAnalyzer(),
    private readonly terrainAnalyzer = new TerrainSemanticAnalyzer()
  ) {}

  analyzeLayer(layer: FormiqLayerData): FormiqLayerData {
    return {
      ...layer,
      buildings: layer.buildings.map((building) => ({
        ...building,
        semantic: this.buildingAnalyzer.analyze(building),
      })),
      roads: layer.roads.map((road) => ({
        ...road,
        semantic: this.roadAnalyzer.analyze(road),
      })),
      vegetation: layer.vegetation.map((vegetation) => ({
        ...vegetation,
        semantic: this.vegetationAnalyzer.analyze(vegetation),
      })),
      water: layer.water.map((water) => ({
        ...water,
        semantic: this.waterAnalyzer.analyze(water),
      })),
      terrain: layer.terrain.map((terrain) => ({
        ...terrain,
        semantic: this.terrainAnalyzer.analyze(terrain),
      })),
    };
  }
}
