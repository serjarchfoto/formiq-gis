import type { AccessibilityAnalysis, AnalysisCalculator } from "../types";

export class AccessibilityCalculator implements AnalysisCalculator<"accessibility"> {
  key = "accessibility" as const;

  calculate(): AccessibilityAnalysis {
    return {
      status: "not-available",
      metro: [],
      stops: [],
      schools: [],
      hospitals: [],
      services: [],
    };
  }
}
