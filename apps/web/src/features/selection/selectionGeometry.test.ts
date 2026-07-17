import { describe, expect, it } from "vitest";
import {
  createSelectionFeatureCollection,
  createSelectionSourceHash,
  createTerritorySelection,
} from "./selectionGeometry";

describe("selection render geometry", () => {
  it("changes the render key when a rectangle moves", () => {
    const first = createSelectionFeatureCollection(
      createTerritorySelection([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]], "rectangle"),
      []
    );
    const moved = createSelectionFeatureCollection(
      createTerritorySelection([[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], "rectangle"),
      []
    );

    expect(createSelectionSourceHash(first)).not.toBe(createSelectionSourceHash(moved));
  });

  it("changes the render key as polygon draft vertices are added", () => {
    const withTwoVertices = createSelectionFeatureCollection(null, [[0, 0], [1, 0]]);
    const withThreeVertices = createSelectionFeatureCollection(null, [[0, 0], [1, 0], [1, 1]]);

    expect(createSelectionSourceHash(withTwoVertices)).not.toBe(createSelectionSourceHash(withThreeVertices));
  });
});
