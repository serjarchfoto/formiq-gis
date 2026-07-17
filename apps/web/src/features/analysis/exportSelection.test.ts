import { describe, expect, it } from "vitest";
import { getAnalysisExportSelection } from "./exportSelection";

describe("analysis export selection", () => {
  it("passes the canonical active layer and scenario through one shared selector", () => {
    expect(getAnalysisExportSelection("floor-count", "compact10")).toEqual(
      expect.objectContaining({
        layer: expect.objectContaining({ id: "floor-count", title: "Этажность застройки" }),
        thematicMapType: "floors",
        scenario: expect.objectContaining({ id: "compact10", title: "Уплотнение 10%" }),
      })
    );
  });

  it("keeps legacy FAR export mapped to built density without creating a second map", () => {
    expect(getAnalysisExportSelection("far", "base")).toEqual(
      expect.objectContaining({
        layer: expect.objectContaining({ id: "built-density" }),
        thematicMapType: "density",
        scenario: expect.objectContaining({ id: "base" }),
      })
    );
  });
});
