import type { Geometry, LineString, Point } from "geojson";
import {
  bboxContains,
  bboxesIntersect,
  getGeometryBbox,
  getSegments,
  isPointOnSegment,
  pointInPolygon,
  segmentsIntersect,
  toGeometry,
} from "./geometryUtils";
import type { BooleanOperation, GeometryInput, GISOperationResult } from "./types";

export class BooleanOperationsService {
  evaluate(operation: BooleanOperation, left: GeometryInput, right: GeometryInput): GISOperationResult<boolean> {
    const leftGeometry = toGeometry(left);
    const rightGeometry = toGeometry(right);

    return {
      value: evaluateBoolean(operation, leftGeometry, rightGeometry),
      metadata: { operation: `boolean-${operation}`, accuracy: "limited" },
    };
  }

  intersects(left: GeometryInput, right: GeometryInput): GISOperationResult<boolean> {
    return this.evaluate("intersects", left, right);
  }

  contains(left: GeometryInput, right: GeometryInput): GISOperationResult<boolean> {
    return this.evaluate("contains", left, right);
  }

  within(left: GeometryInput, right: GeometryInput): GISOperationResult<boolean> {
    return this.evaluate("within", left, right);
  }
}

function evaluateBoolean(operation: BooleanOperation, left: Geometry, right: Geometry): boolean {
  if (operation === "equals") return JSON.stringify(left) === JSON.stringify(right);
  if (operation === "disjoint") return !evaluateBoolean("intersects", left, right);
  if (operation === "within") return evaluateBoolean("contains", right, left);
  if (operation === "contains") return contains(left, right);
  if (operation === "point-in-polygon") return left.type === "Point" && right.type === "Polygon" && pointInPolygon(left.coordinates, right);
  if (operation === "point-on-line") return left.type === "Point" && right.type === "LineString" && pointOnLine(left, right);

  return intersects(left, right);
}

function contains(left: Geometry, right: Geometry): boolean {
  const leftBbox = getGeometryBbox(left);
  const rightBbox = getGeometryBbox(right);

  if (!leftBbox || !rightBbox || !bboxContains(leftBbox, rightBbox)) return false;
  if (left.type === "Polygon" && right.type === "Point") return pointInPolygon(right.coordinates, left);
  if (left.type === "Polygon") {
    return getGeometryBbox(right) !== null && getRepresentativePoints(right).every((point) => pointInPolygon(point, left));
  }

  return JSON.stringify(left) === JSON.stringify(right);
}

function intersects(left: Geometry, right: Geometry): boolean {
  const leftBbox = getGeometryBbox(left);
  const rightBbox = getGeometryBbox(right);

  if (!leftBbox || !rightBbox || !bboxesIntersect(leftBbox, rightBbox)) return false;
  if (left.type === "Point" && right.type === "Polygon") return pointInPolygon(left.coordinates, right);
  if (right.type === "Point" && left.type === "Polygon") return pointInPolygon(right.coordinates, left);
  if (left.type === "Point" && right.type === "LineString") return pointOnLine(left, right);
  if (right.type === "Point" && left.type === "LineString") return pointOnLine(right, left);

  const leftSegments = getSegments(left);
  const rightSegments = getSegments(right);

  if (leftSegments.some((leftSegment) => rightSegments.some((rightSegment) => segmentsIntersect(leftSegment, rightSegment)))) {
    return true;
  }

  if (left.type === "Polygon") return getRepresentativePoints(right).some((point) => pointInPolygon(point, left));
  if (right.type === "Polygon") return getRepresentativePoints(left).some((point) => pointInPolygon(point, right));

  return true;
}

function pointOnLine(point: Point, line: LineString): boolean {
  return line.coordinates.some((coordinate, index, coordinates) => {
    if (index === 0) return false;
    return isPointOnSegment(point.coordinates, coordinates[index - 1], coordinate);
  });
}

function getRepresentativePoints(geometry: Geometry) {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}
