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
import { getAnalysisDefinition } from "./AnalysisRequirementsRegistry";
import type { AnalysisContext, AnalysisExecutionResult, AnalysisResult } from "./types";

export class AnalysisEngine {
  constructor(private readonly registry = createDefaultAnalysisRegistry()) {}

  /** @deprecated Use runAnalysis with a Data Hub AnalysisContext for all new flows. */
  analyze(project: FormiqProjectData): AnalysisResult {
    return this.calculate(project);
  }

  async runAnalysis(input: {
    analysisId: string;
    context: AnalysisContext;
    options?: Record<string, unknown>;
  }): Promise<AnalysisExecutionResult> {
    const definition = getAnalysisDefinition(input.analysisId);
    if (input.context.analysisId !== input.analysisId) {
      throw new AnalysisExecutionError("CONTEXT_MISMATCH", "Analysis context belongs to another analysis.");
    }
    const requiredMissing = input.context.dataHub.missingRequirements.some(
      (requirement) => requirement.required && (input.context.dataHub.features[requirement.domain]?.length ?? 0) === 0
    );
    const anyDomainMissing = definition.requiresAnyDomain?.every(
      (domain) => (input.context.dataHub.features[domain]?.length ?? 0) === 0
    ) ?? false;
    if (requiredMissing || anyDomainMissing) {
      throw new AnalysisExecutionError("MISSING_REQUIRED_DATA", "Required canonical data is unavailable.");
    }
    if (input.context.dataHub.degraded && !definition.supportsDegradedMode) {
      throw new AnalysisExecutionError("DEGRADED_NOT_SUPPORTED", "This analysis cannot run in degraded mode.");
    }

    void input.options;
    return {
      analysisId: input.analysisId,
      result: this.calculate(input.context.project),
      state: input.context.dataHub.degraded ? "degraded" : "ready",
      warnings: input.context.warnings,
      snapshotId: input.context.dataHub.snapshotId,
      source: input.context.source,
    };
  }

  private calculate(project: FormiqProjectData): AnalysisResult {
    const context = { project };
    const result: Partial<AnalysisResult> = {};

    this.registry.getAll().forEach((calculator) => {
      result[calculator.key] = calculator.calculate(context, result) as never;
    });

    return result as AnalysisResult;
  }
}

export class AnalysisExecutionError extends Error {
  constructor(readonly code: "CONTEXT_MISMATCH" | "MISSING_REQUIRED_DATA" | "DEGRADED_NOT_SUPPORTED", message: string) {
    super(message);
    this.name = "AnalysisExecutionError";
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
