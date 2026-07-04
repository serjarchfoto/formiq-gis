import type { AnalysisCalculator } from "./types";

export class AnalysisRegistry {
  private readonly calculators: AnalysisCalculator[] = [];

  register(calculator: AnalysisCalculator): this {
    this.calculators.push(calculator);

    return this;
  }

  getAll(): AnalysisCalculator[] {
    return this.calculators;
  }
}
