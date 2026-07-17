import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from "geojson";

const MIN_RING_COORDINATES = 4;
const MICROSOFT_EDGE_TOLERANCE_METERS = 1.25;

export function prepareThematicGeoJsonForRendering(
  collection: FeatureCollection<Geometry, GeoJsonProperties>,
  sourceHash: string
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    ...collection,
    features: collection.features.flatMap((feature) => {
      const geometry = normalizeGeometry(
        feature.geometry,
        feature.properties?.geometrySource === "microsoft-buildings"
          ? MICROSOFT_EDGE_TOLERANCE_METERS
          : 0
      );

      if (!geometry) {
        return [];
      }

      return [
        {
          ...feature,
          geometry,
          properties: {
            ...(feature.properties ?? {}),
            sourceHash,
          },
        } satisfies Feature<Geometry, GeoJsonProperties>,
      ];
    }),
  };
}

function normalizeGeometry(geometry: Geometry, toleranceMeters: number): Geometry | null {
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates
      .map((ring) => normalizeRing(ring, toleranceMeters))
      .filter((ring): ring is Position[] => Boolean(ring));

    return coordinates.length > 0 ? { ...geometry, coordinates } : null;
  }

  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates
      .map((polygon) =>
        polygon
          .map((ring) => normalizeRing(ring, toleranceMeters))
          .filter((ring): ring is Position[] => Boolean(ring))
      )
      .filter((polygon) => polygon.length > 0);

    return coordinates.length > 0 ? { ...geometry, coordinates } : null;
  }

  return geometry;
}

function normalizeRing(ring: Position[], toleranceMeters: number): Position[] | null {
  const clean: Position[] = [];

  for (const position of ring) {
    if (!isFinitePosition(position)) continue;
    if (clean.length > 0 && positionsEqual(clean.at(-1)!, position)) continue;
    clean.push(position);
  }

  if (clean.length > 1 && positionsEqual(clean[0], clean.at(-1)!)) {
    clean.pop();
  }

  if (clean.length < MIN_RING_COORDINATES - 1) {
    return null;
  }

  const simplified = toleranceMeters > 0
    ? removeNearCollinearVertices(clean, toleranceMeters)
    : clean;

  return simplified.length >= MIN_RING_COORDINATES - 1
    ? [...simplified, simplified[0]]
    : null;
}

function removeNearCollinearVertices(ring: Position[], toleranceMeters: number): Position[] {
  if (ring.length <= MIN_RING_COORDINATES - 1) return ring;

  const protectedPositions = getExtentPositions(ring);
  let result = [...ring];
  let changed = true;

  while (changed && result.length > MIN_RING_COORDINATES - 1) {
    changed = false;
    const next: Position[] = [];

    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const following = result[(index + 1) % result.length];
      const protectedPosition = protectedPositions.some((position) => positionsEqual(position, current));

      if (
        !protectedPosition &&
        result.length - next.length > MIN_RING_COORDINATES - 1 &&
        pointToSegmentDistanceMeters(current, previous, following) <= toleranceMeters
      ) {
        changed = true;
        continue;
      }

      next.push(current);
    }

    if (next.length < MIN_RING_COORDINATES - 1) break;
    result = next;
  }

  return result;
}

function getExtentPositions(ring: Position[]): Position[] {
  return [
    ring.reduce((best, position) => position[0] < best[0] ? position : best),
    ring.reduce((best, position) => position[0] > best[0] ? position : best),
    ring.reduce((best, position) => position[1] < best[1] ? position : best),
    ring.reduce((best, position) => position[1] > best[1] ? position : best),
  ];
}

function pointToSegmentDistanceMeters(point: Position, start: Position, end: Position): number {
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const metersPerLongitudeDegree = 111_320 * Math.cos(latitudeRadians);
  const metersPerLatitudeDegree = 110_540;
  const px = (point[0] - start[0]) * metersPerLongitudeDegree;
  const py = (point[1] - start[1]) * metersPerLatitudeDegree;
  const ex = (end[0] - start[0]) * metersPerLongitudeDegree;
  const ey = (end[1] - start[1]) * metersPerLatitudeDegree;
  const lengthSquared = ex * ex + ey * ey;

  if (lengthSquared === 0) return Math.hypot(px, py);

  const factor = Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - factor * ex, py - factor * ey);
}

function isFinitePosition(position: Position): boolean {
  return position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

function positionsEqual(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
