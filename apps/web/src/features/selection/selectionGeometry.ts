import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon, Position } from "geojson";
import type { TerritorySelection } from "@/store/selection";

export function createRectangleCoordinates(start: Position, end: Position): Position[] {
  const west = Math.min(start[0], end[0]);
  const east = Math.max(start[0], end[0]);
  const south = Math.min(start[1], end[1]);
  const north = Math.max(start[1], end[1]);

  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

export function createSelectionFeatureCollection(
  selection: TerritorySelection | null,
  draftCoordinates: Position[]
): FeatureCollection<Geometry> {
  const features: Feature<Geometry>[] = [];

  if (selection) {
    features.push(selection.geometry);
  }

  if (draftCoordinates.length === 1) {
    features.push({
      type: "Feature",
      properties: {
        type: "draft-point",
      },
      geometry: {
        type: "Point",
        coordinates: draftCoordinates[0],
      } satisfies Point,
    });
  }

  if (draftCoordinates.length > 1) {
    const isClosed = isClosedRing(draftCoordinates);
    const geometry = isClosed
      ? ({
          type: "Polygon",
          coordinates: [draftCoordinates],
        } satisfies Polygon)
      : ({
          type: "LineString",
          coordinates: draftCoordinates,
        } satisfies LineString);

    features.push({
      type: "Feature",
      properties: {
        type: "draft",
      },
      geometry,
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function isClosedRing(coordinates: Position[]): boolean {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  return Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
}
