import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import {
  bboxIntersection,
  bboxToPolygon,
  createPolygonFeature,
  destinationPoint,
  expandBboxMeters,
  getGeometryBbox,
  polygonToBboxIfRectangle,
  toGeometry,
} from "./geometryUtils";
import type { BufferOptions, GeometryInput, GISOperationResult, GISPolygonFeature } from "./types";

export class OverlayOperationsService {
  buffer(input: GeometryInput, options: BufferOptions): GISOperationResult<GISPolygonFeature | null> {
    const geometry = toGeometry(input);

    if (geometry.type === "Point") {
      return {
        value: createPolygonFeature(createCirclePolygon(geometry, options.radiusMeters, options.steps ?? 32)),
        metadata: { operation: "buffer", accuracy: "approximate" },
      };
    }

    const bbox = getGeometryBbox(geometry);

    return {
      value: bbox ? createPolygonFeature(bboxToPolygon(expandBboxMeters(bbox, options.radiusMeters))) : null,
      metadata: {
        operation: "buffer",
        accuracy: "approximate",
        note: "Non-point buffers use an expanded bbox for fast viewport and selection workflows.",
      },
    };
  }

  intersection(left: GeometryInput, right: GeometryInput): GISOperationResult<GISPolygonFeature | null> {
    const intersection = getRectangleIntersection(left, right);

    return {
      value: intersection ? createPolygonFeature(bboxToPolygon(intersection)) : null,
      metadata: { operation: "intersection", accuracy: "limited", note: "Exact for rectangular polygons and bboxes." },
    };
  }

  union(left: GeometryInput, right: GeometryInput): GISOperationResult<GISPolygonFeature | null> {
    const leftBbox = getGeometryBbox(toGeometry(left));
    const rightBbox = getGeometryBbox(toGeometry(right));

    if (!leftBbox || !rightBbox) {
      return {
        value: null,
        metadata: { operation: "union", accuracy: "limited", note: "No bbox could be computed." },
      };
    }

    return {
      value: createPolygonFeature(
        bboxToPolygon({
          west: Math.min(leftBbox.west, rightBbox.west),
          south: Math.min(leftBbox.south, rightBbox.south),
          east: Math.max(leftBbox.east, rightBbox.east),
          north: Math.max(leftBbox.north, rightBbox.north),
        })
      ),
      metadata: { operation: "union", accuracy: "limited", note: "Returns a union envelope, not a full polygon dissolve." },
    };
  }

  difference(left: GeometryInput, right: GeometryInput): GISOperationResult<Feature<Polygon | MultiPolygon> | null> {
    const leftGeometry = toGeometry(left);
    const rightGeometry = toGeometry(right);

    if (leftGeometry.type !== "Polygon" || rightGeometry.type !== "Polygon") {
      return {
        value: null,
        metadata: { operation: "difference", accuracy: "limited", note: "Difference currently supports rectangular polygons." },
      };
    }

    const leftBbox = polygonToBboxIfRectangle(leftGeometry);
    const rightBbox = polygonToBboxIfRectangle(rightGeometry);

    if (!leftBbox || !rightBbox) {
      return {
        value: null,
        metadata: { operation: "difference", accuracy: "limited", note: "Difference currently supports rectangular polygons." },
      };
    }

    const intersection = bboxIntersection(leftBbox, rightBbox);

    if (!intersection) {
      return {
        value: createPolygonFeature(leftGeometry),
        metadata: { operation: "difference", accuracy: "exact" },
      };
    }

    const pieces = subtractRectangle(leftBbox, intersection);

    return {
      value:
        pieces.length === 0
          ? null
          : pieces.length === 1
            ? createPolygonFeature(bboxToPolygon(pieces[0]))
            : {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "MultiPolygon",
                  coordinates: pieces.map((piece) => bboxToPolygon(piece).coordinates),
                },
              },
      metadata: { operation: "difference", accuracy: "exact", note: "Exact for rectangular polygons." },
    };
  }
}

function createCirclePolygon(point: Point, radiusMeters: number, steps: number): Polygon {
  const safeSteps = Math.max(8, Math.round(steps));
  const ring = Array.from({ length: safeSteps }, (_, index) =>
    destinationPoint(point.coordinates, radiusMeters, (360 / safeSteps) * index)
  );

  return {
    type: "Polygon",
    coordinates: [[...ring, ring[0]]],
  };
}

function getRectangleIntersection(left: GeometryInput, right: GeometryInput) {
  const leftGeometry = toGeometry(left);
  const rightGeometry = toGeometry(right);
  const leftBbox = leftGeometry.type === "Polygon" ? polygonToBboxIfRectangle(leftGeometry) : getGeometryBbox(leftGeometry);
  const rightBbox = rightGeometry.type === "Polygon" ? polygonToBboxIfRectangle(rightGeometry) : getGeometryBbox(rightGeometry);

  return leftBbox && rightBbox ? bboxIntersection(leftBbox, rightBbox) : null;
}

function subtractRectangle(rectangle: ReturnType<typeof polygonToBboxIfRectangle>, cut: NonNullable<ReturnType<typeof bboxIntersection>>) {
  if (!rectangle) return [];

  const pieces = [
    { west: rectangle.west, south: cut.north, east: rectangle.east, north: rectangle.north },
    { west: rectangle.west, south: rectangle.south, east: rectangle.east, north: cut.south },
    { west: rectangle.west, south: cut.south, east: cut.west, north: cut.north },
    { west: cut.east, south: cut.south, east: rectangle.east, north: cut.north },
  ];

  return pieces.filter((piece) => piece.east > piece.west && piece.north > piece.south);
}
