import type { Position } from "geojson";
import { calculateRingAreaMeters, createPointFeature, getFlatCoordinates, toGeometry } from "./geometryUtils";
import type { GeometryInput, GISOperationResult, GISPointFeature } from "./types";

export class CentroidService {
  centroid(input: GeometryInput): GISOperationResult<GISPointFeature> {
    const geometry = toGeometry(input);
    const coordinates = getFlatCoordinates(geometry);
    const centroid =
      geometry.type === "Polygon"
        ? getPolygonCentroid(geometry.coordinates[0] ?? [])
        : getMeanCenter(coordinates);

    return {
      value: createPointFeature(centroid),
      metadata: { operation: "centroid", accuracy: "exact" },
    };
  }
}

function getMeanCenter(coordinates: Position[]): Position {
  if (!coordinates.length) return [0, 0];

  const [lng, lat] = coordinates.reduce(
    ([sumLng, sumLat], coordinate) => [sumLng + coordinate[0], sumLat + coordinate[1]],
    [0, 0]
  );

  return [lng / coordinates.length, lat / coordinates.length];
}

function getPolygonCentroid(ring: Position[]): Position {
  if (ring.length < 4 || calculateRingAreaMeters(ring) === 0) return getMeanCenter(ring);

  let twiceArea = 0;
  let lng = 0;
  let lat = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const factor = current[0] * next[1] - next[0] * current[1];

    twiceArea += factor;
    lng += (current[0] + next[0]) * factor;
    lat += (current[1] + next[1]) * factor;
  }

  return twiceArea === 0 ? getMeanCenter(ring) : [lng / (3 * twiceArea), lat / (3 * twiceArea)];
}
