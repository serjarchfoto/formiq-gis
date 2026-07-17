import type { BoundingBox } from "@/types/gis";
import type { ImportGridCell } from "./types";

export interface BoundingBoxGridOptions {
  targetCellAreaSquareKilometers?: number;
  maxCellsPerAxis?: number;
}

export function createBoundingBoxGrid(
  bounds: BoundingBox,
  options: BoundingBoxGridOptions = {}
): ImportGridCell[] {
  const targetArea = Math.max(1, options.targetCellAreaSquareKilometers ?? 12);
  const maxCellsPerAxis = Math.max(1, options.maxCellsPerAxis ?? 12);
  const middleLatitudeRadians = (((bounds.south + bounds.north) / 2) * Math.PI) / 180;
  const widthKilometers = Math.abs(bounds.east - bounds.west) * 111.32 * Math.cos(middleLatitudeRadians);
  const heightKilometers = Math.abs(bounds.north - bounds.south) * 111.32;
  const targetSide = Math.sqrt(targetArea);
  const columns = clamp(Math.ceil(widthKilometers / targetSide), 1, maxCellsPerAxis);
  const rows = clamp(Math.ceil(heightKilometers / targetSide), 1, maxCellsPerAxis);
  const longitudeStep = (bounds.east - bounds.west) / columns;
  const latitudeStep = (bounds.north - bounds.south) / rows;
  const cells: ImportGridCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileId = `r${row}-c${column}`;
      cells.push({
        id: tileId,
        tileId,
        row,
        column,
        bounds: {
          west: bounds.west + longitudeStep * column,
          south: bounds.south + latitudeStep * row,
          east: column === columns - 1 ? bounds.east : bounds.west + longitudeStep * (column + 1),
          north: row === rows - 1 ? bounds.north : bounds.south + latitudeStep * (row + 1),
        },
        status: "queued",
        attempts: 0,
        error: null,
      });
    }
  }

  return cells;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
