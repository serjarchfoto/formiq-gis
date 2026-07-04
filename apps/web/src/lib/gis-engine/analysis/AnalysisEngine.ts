import type { FormiqProjectData } from "@/types/formiq";
import { AnalysisRegistry } from "./AnalysisRegistry";
import { AccessibilityCalculator } from "./calculators/AccessibilityCalculator";
import { AgeCalculator } from "./calculators/AgeCalculator";
import { AreaCalculator } from "./calculators/AreaCalculator";
import { BuildingCalculator } from "./calculators/BuildingCalculator";
import { DensityCalculator } from "./calculators/DensityCalculator";
import { FloorCalculator } from "./calculators/FloorCalculator";
import { FunctionCalculator } from "./calculators/FunctionCalculator";
import { RoadCalculator } from "./calculators/RoadCalculator";
import { TerrainCalculator } from "./calculators/TerrainCalculator";
import { VegetationCalculator } from "./calculators/VegetationCalculator";
import { WaterCalculator } from "./calculators/WaterCalculator";
import type { AnalysisResult } from "./types";

export class AnalysisEngine {
  constructor(private readonly registry = createDefaultAnalysisRegistry()) {}

  analyze(project: FormiqProjectData): AnalysisResult {
    const context = { project };
    const result: Partial<AnalysisResult> = {};

    this.registry.getAll().forEach((calculator) => {
      result[calculator.key] = calculator.calculate(context, result) as never;
    });

    return result as AnalysisResult;
  }
}

export function createDefaultAnalysisRegistry(): AnalysisRegistry {
  return new AnalysisRegistry()
    .register(new AreaCalculator())
    .register(new BuildingCalculator())
    .register(new DensityCalculator())
    .register(new FloorCalculator())
    .register(new AgeCalculator())
    .register(new FunctionCalculator())
    .register(new RoadCalculator())
    .register(new VegetationCalculator())
    .register(new WaterCalculator())
    .register(new TerrainCalculator())
    .register(new AccessibilityCalculator());
}
