import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  Polygon,
  Position,
} from "geojson";

type FeatureBbox = [number, number, number, number];

export function clipFeatureCollectionToTerritory<TGeometry extends Geometry>(
  featureCollection: FeatureCollection<TGeometry, GeoJsonProperties>,
  territoryPolygon: Feature<Polygon> | Polygon | null | undefined
): FeatureCollection<TGeometry, GeoJsonProperties> {
  if (!territoryPolygon) {
    return featureCollection;
  }

  return {
    ...featureCollection,
    features: featureCollection.features
      .map((feature) => clipFeatureToTerritory(feature, territoryPolygon))
      .filter((feature): feature is Feature<TGeometry, GeoJsonProperties> => feature !== null),
  };
}

export function clipFeatureToTerritory<TGeometry extends Geometry>(
  feature: Feature<TGeometry, GeoJsonProperties>,
  territoryPolygon: Feature<Polygon> | Polygon
): Feature<TGeometry, GeoJsonProperties> | null {
  const territory = toPolygon(territoryPolygon);
  const territoryBbox = getGeometryBbox(territory);
  const featureBbox = getGeometryBbox(feature.geometry);

  if (!territoryBbox || !featureBbox || !bboxesIntersect(featureBbox, territoryBbox)) {
    return null;
  }

  if (feature.geometry.type === "Point") {
    return isPointInsideTerritory(feature.geometry.coordinates, territory) ? feature : null;
  }

  if (feature.geometry.type === "LineString") {
    const clippedLine = clipLineToTerritory(feature.geometry, territory);
    return clippedLine ? ({ ...feature, geometry: clippedLine as TGeometry } as Feature<TGeometry, GeoJsonProperties>) : null;
  }

  if (feature.geometry.type === "Polygon") {
    const clippedPolygon = clipPolygonToTerritory(feature.geometry, territory);
    return clippedPolygon
      ? ({ ...feature, geometry: clippedPolygon as TGeometry } as Feature<TGeometry, GeoJsonProperties>)
      : null;
  }

  return isPointInsideTerritory(getGeometryReferencePoint(feature.geometry), territory) ? feature : null;
}

export function isPointInsideTerritory(point: Position, territoryPolygon: Feature<Polygon> | Polygon): boolean {
  const polygon = toPolygon(territoryPolygon);
  const ring = polygon.coordinates[0] ?? [];
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function clipLineToTerritory(line: LineString, territoryPolygon: Feature<Polygon> | Polygon): LineString | null {
  const ring = toPolygon(territoryPolygon).coordinates[0] ?? [];
  let longestSegment: Position[] = [];
  let currentSegment: Position[] = [];

  const flush = () => {
    if (currentSegment.length > longestSegment.length) {
      longestSegment = currentSegment;
    }
    currentSegment = [];
  };

  for (let index = 1; index < line.coordinates.length; index += 1) {
    const start = line.coordinates[index - 1];
    const end = line.coordinates[index];
    const parameters = [0, 1];

    for (let edgeIndex = 1; edgeIndex < ring.length; edgeIndex += 1) {
      const edgeStart = ring[edgeIndex - 1];
      const edgeEnd = ring[edgeIndex];
      const parameter = segmentIntersectionParameter(start, end, edgeStart, edgeEnd);
      if (parameter !== null) parameters.push(parameter);
    }

    parameters.sort((left, right) => left - right);
    const uniqueParameters = parameters.filter((value, parameterIndex) => parameterIndex === 0 || Math.abs(value - parameters[parameterIndex - 1]) > 1e-10);

    for (let parameterIndex = 1; parameterIndex < uniqueParameters.length; parameterIndex += 1) {
      const from = uniqueParameters[parameterIndex - 1];
      const to = uniqueParameters[parameterIndex];
      if (to - from <= 1e-10) continue;
      const midpoint = interpolatePosition(start, end, (from + to) / 2);

      if (!isPointInsideTerritory(midpoint, territoryPolygon)) {
        flush();
        continue;
      }

      const clippedStart = interpolatePosition(start, end, from);
      const clippedEnd = interpolatePosition(start, end, to);
      if (currentSegment.length === 0) {
        currentSegment.push(clippedStart);
      } else if (!samePosition(currentSegment[currentSegment.length - 1], clippedStart)) {
        flush();
        currentSegment.push(clippedStart);
      }
      currentSegment.push(clippedEnd);
    }
  }

  flush();
  return longestSegment.length >= 2 ? { type: "LineString", coordinates: longestSegment } : null;
}

export function clipPolygonToTerritory(polygon: Polygon, territoryPolygon: Feature<Polygon> | Polygon): Polygon | null {
  const ring = polygon.coordinates[0] ?? [];
  const hasVertexInside = ring.some((coordinate) => isPointInsideTerritory(coordinate, territoryPolygon));

  if (hasVertexInside || isPointInsideTerritory(getCoordinatesCentroid(ring), territoryPolygon)) {
    // Polygon clipping remains conservative for non-convex territories: the
    // feature is retained when it overlaps by a known vertex/centroid.
    return polygon;
  }

  return null;
}

function segmentIntersectionParameter(a: Position, b: Position, c: Position, d: Position): number | null {
  const denominator = crossProduct([b[0] - a[0], b[1] - a[1]], [d[0] - c[0], d[1] - c[1]]);
  if (Math.abs(denominator) <= 1e-12) return null;

  const offset = [c[0] - a[0], c[1] - a[1]] as Position;
  const lineParameter = crossProduct(offset, [d[0] - c[0], d[1] - c[1]]) / denominator;
  const edgeParameter = crossProduct(offset, [b[0] - a[0], b[1] - a[1]]) / denominator;
  return lineParameter >= -1e-10 && lineParameter <= 1 + 1e-10 && edgeParameter >= -1e-10 && edgeParameter <= 1 + 1e-10
    ? Math.min(1, Math.max(0, lineParameter))
    : null;
}

function interpolatePosition(start: Position, end: Position, parameter: number): Position {
  return [start[0] + (end[0] - start[0]) * parameter, start[1] + (end[1] - start[1]) * parameter];
}

function samePosition(left: Position, right: Position): boolean {
  return Math.abs(left[0] - right[0]) <= 1e-10 && Math.abs(left[1] - right[1]) <= 1e-10;
}

function crossProduct(left: Position, right: Position): number {
  return left[0] * right[1] - left[1] * right[0];
}

export function getGeometryReferencePoint(geometry: Geometry): Position {
  if (geometry.type === "Point") {
    return geometry.coordinates;
  }

  if (geometry.type === "LineString") {
    return getCoordinatesCentroid(geometry.coordinates);
  }

  if (geometry.type === "Polygon") {
    return getCoordinatesCentroid(geometry.coordinates[0] ?? []);
  }

  if (geometry.type === "MultiPoint") {
    return getCoordinatesCentroid(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    return getCoordinatesCentroid(geometry.coordinates.flat());
  }

  if (geometry.type === "MultiPolygon") {
    return getCoordinatesCentroid(geometry.coordinates.flat(2));
  }

  return [0, 0];
}

export function getCoordinatesCentroid(coordinates: Position[]): Position {
  if (!coordinates.length) {
    return [0, 0];
  }

  const [lng, lat] = coordinates.reduce(
    ([sumLng, sumLat], coordinate) => [sumLng + coordinate[0], sumLat + coordinate[1]],
    [0, 0]
  );

  return [lng / coordinates.length, lat / coordinates.length];
}

function toPolygon(territoryPolygon: Feature<Polygon> | Polygon): Polygon {
  return territoryPolygon.type === "Feature" ? territoryPolygon.geometry : territoryPolygon;
}

function getGeometryBbox(geometry: Geometry): FeatureBbox | null {
  const coordinates = getFlatCoordinates(geometry);

  if (!coordinates.length) {
    return null;
  }

  return coordinates.reduce<FeatureBbox>(
    ([minLng, minLat, maxLng, maxLat], coordinate) => [
      Math.min(minLng, coordinate[0]),
      Math.min(minLat, coordinate[1]),
      Math.max(maxLng, coordinate[0]),
      Math.max(maxLat, coordinate[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

function getFlatCoordinates(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function bboxesIntersect(a: FeatureBbox, b: FeatureBbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
