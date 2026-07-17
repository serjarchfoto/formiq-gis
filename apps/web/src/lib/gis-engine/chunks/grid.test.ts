import { describe, expect, it } from "vitest";
import { createBoundingBoxGrid } from "./grid";

describe("createBoundingBoxGrid", () => {
  it("covers the source bounds without gaps and keeps stable tile ids", () => {
    const bounds = { west: 37, south: 55, east: 37.2, north: 55.1 };
    const cells = createBoundingBoxGrid(bounds, {
      targetCellAreaSquareKilometers: 20,
      maxCellsPerAxis: 10,
    });

    expect(cells.length).toBeGreaterThan(1);
    expect(cells[0]).toMatchObject({ tileId: "r0-c0", row: 0, column: 0 });
    expect(Math.min(...cells.map((cell) => cell.bounds.west))).toBe(bounds.west);
    expect(Math.min(...cells.map((cell) => cell.bounds.south))).toBe(bounds.south);
    expect(Math.max(...cells.map((cell) => cell.bounds.east))).toBe(bounds.east);
    expect(Math.max(...cells.map((cell) => cell.bounds.north))).toBe(bounds.north);

    for (const cell of cells) {
      expect(cell.bounds.east).toBeGreaterThan(cell.bounds.west);
      expect(cell.bounds.north).toBeGreaterThan(cell.bounds.south);
      expect(cell.status).toBe("queued");
    }
  });

  it("caps both axes for very large territories", () => {
    const cells = createBoundingBoxGrid(
      { west: 20, south: 40, east: 50, north: 70 },
      { targetCellAreaSquareKilometers: 1, maxCellsPerAxis: 4 }
    );

    expect(cells).toHaveLength(16);
  });
});
