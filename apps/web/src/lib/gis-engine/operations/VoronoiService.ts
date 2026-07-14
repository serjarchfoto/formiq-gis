import type { FeatureCollection, Point, Polygon, Position } from "geojson";
import { bboxToPolygon, createPolygonFeature, distanceMeters } from "./geometryUtils";
import type { GISOperationResult, VoronoiOptions } from "./types";

export class VoronoiService {
  voronoi(points: FeatureCollection<Point>, options: VoronoiOptions): GISOperationResult<FeatureCollection<Polygon>> {
    const cells = points.features
      .map((point, index) => {
        let cell = bboxToPolygon(options.bbox).coordinates[0];

        points.features.forEach((other, otherIndex) => {
          if (index === otherIndex || !cell.length) return;
          cell = clipByBisector(cell, point.geometry.coordinates, other.geometry.coordinates);
        });

        if (cell.length < 3) return null;

        const closedCell = ensureClosed(cell);

        return createPolygonFeature(
          { type: "Polygon", coordinates: [closedCell] },
          {
            sourcePointIndex: index,
            sourcePointId: point.id ?? point.properties?.id ?? null,
          }
        );
      })
      .filter((feature): feature is ReturnType<typeof createPolygonFeature> => feature !== null);

    return {
      value: { type: "FeatureCollection", features: cells },
      metadata: {
        operation: "voronoi",
        accuracy: "approximate",
        note: "Planar lon/lat Voronoi clipped to bbox; intended for local analysis extents.",
      },
    };
  }
}

function clipByBisector(ring: Position[], site: Position, other: Position): Position[] {
  const output: Position[] = [];

  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = isCloserToSite(current, site, other);
    const previousInside = isCloserToSite(previous, site, other);

    if (currentInside && !previousInside) output.push(intersectBisector(previous, current, site, other));
    if (currentInside) output.push(current);
    if (!currentInside && previousInside) output.push(intersectBisector(previous, current, site, other));
  });

  return output;
}

function isCloserToSite(point: Position, site: Position, other: Position): boolean {
  return distanceMeters(point, site) <= distanceMeters(point, other);
}

function intersectBisector(start: Position, end: Position, site: Position, other: Position): Position {
  let low = start;
  let high = end;

  for (let index = 0; index < 32; index += 1) {
    const mid: Position = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2];

    if (isCloserToSite(mid, site, other) === isCloserToSite(low, site, other)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2];
}

function ensureClosed(ring: Position[]): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];

  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}
