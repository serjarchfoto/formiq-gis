import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AnalysisWorkspace Data Hub boundary", () => {
  const source = readFileSync(new URL("./AnalysisWorkspace.tsx", import.meta.url), "utf8");

  it("does not rebuild analysis data from project layers or fusion collections", () => {
    expect(source).not.toContain("project.layers.length");
    expect(source).not.toContain("project.fusion?.collections");
    expect(source).not.toContain("fusion?.buildings");
    expect(source).toContain("analysisContextResolver.load");
  });

  it("declares every required workspace state", () => {
    for (const state of [
      "territory_not_selected", "loading_context", "ready", "degraded",
      "missing_required_data", "acquisition_available", "analysis_running", "analysis_failed",
    ]) expect(source).toContain(`\"${state}\"`);
  });
});
