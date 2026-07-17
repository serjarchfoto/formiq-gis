import { describe, expect, it } from "vitest";
import { clipLineToTerritory } from "./clipToTerritory";

describe("clipLineToTerritory", () => {
  it("clips a line at territory edges instead of using its centroid", () => {
    const clipped = clipLineToTerritory(
      { type: "LineString", coordinates: [[0, 0.5], [2, 0.5]] },
      {
        type: "Polygon",
        coordinates: [[[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1], [0.5, 0]]],
      }
    );

    expect(clipped?.coordinates).toEqual([[0.5, 0.5], [1.5, 0.5]]);
  });
});
