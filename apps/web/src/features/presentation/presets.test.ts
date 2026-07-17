import { describe, expect, it } from "vitest";
import { getPresentationMapPreset, presentationMapPresets } from "./presets";

describe("presentation map presets", () => {
  it("keeps the nine approved cartographic references in a stable order", () => {
    expect(presentationMapPresets.map((preset) => preset.id)).toEqual([
      "population-grid",
      "transit-access",
      "population-heatmap",
      "terrain-height",
      "building-floors",
      "building-age",
      "functional-zoning",
      "axonometric-zoning",
      "shadow-analysis",
    ]);
  });

  it("defines a usable title, method, legend and palette for every preset", () => {
    for (const preset of presentationMapPresets) {
      expect(preset.title.length).toBeGreaterThan(8);
      expect(preset.method.length).toBeGreaterThan(20);
      expect(preset.palette.length).toBeGreaterThanOrEqual(3);
      expect(preset.legendLabels.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("falls back to the building-floor plan", () => {
    expect(getPresentationMapPreset("missing" as never).id).toBe("building-floors");
  });
});
