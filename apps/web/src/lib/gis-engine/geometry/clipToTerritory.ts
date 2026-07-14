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
  const insideCoordinates = line.coordinates.filter((coordinate) => isPointInsideTerritory(coordinate, territoryPolygon));

  if (insideCoordinates.length >= 2) {
    return {
      type: "LineString",
      coordinates: insideCoordinates,
    };
  }

  // TODO: replace centroid fallback with exact line clipping against territory polygon edges.
  return isPointInsideTerritory(getCoordinatesCentroid(line.coordinates), territoryPolygon) ? line : null;
}

export function clipPolygonToTerritory(polygon: Polygon, territoryPolygon: Feature<Polygon> | Polygon): Polygon | null {
  const ring = polygon.coordinates[0] ?? [];
  const hasVertexInside = ring.some((coordinate) => isPointInsideTerritory(coordinate, territoryPolygon));

  if (hasVertexInside || isPointInsideTerritory(getCoordinatesCentroid(ring), territoryPolygon)) {
    // TODO: replace centroid/vertex fallback with exact polygon clipping against territory polygon edges.
    return polygon;
  }

  return null;
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
