import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon, Position } from "geojson";
import type { FormiqTerritory } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";
import type { TerritorySelection, TerritorySelectionShape } from "@/store/selection";

export interface SelectionHandleFeatureProperties {
  featureType: "selection-handle";
  handleKind: "corner" | "edge" | "rotate" | "vertex";
  handleId: string;
  vertexIndex?: number;
}

export interface RectangleFrame {
  center: Position;
  xAxis: Position;
  yAxis: Position;
  halfWidth: number;
  halfHeight: number;
}

const MIN_RECTANGLE_SIZE = 0.00005;
const MIN_ROTATE_HANDLE_OFFSET = 0.0005;

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
    features.push({
      ...selection.geometry,
      properties: {
        ...(selection.geometry.properties ?? {}),
        selectionShape: selection.shape,
        featureType: "selection",
      },
    });
    features.push(...createSelectionHandleFeatures(selection));
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

export function createTerritorySelection(
  coordinates: Position[],
  shape: TerritorySelectionShape
): TerritorySelection {
  const closedCoordinates = closeRing(coordinates);

  return {
    shape,
    bounds: createBoundingBox(closedCoordinates),
    geometry: {
      type: "Feature",
      properties: {
        source: "formiq-selection",
      },
      geometry: {
        type: "Polygon",
        coordinates: [closedCoordinates],
      },
    },
  };
}

export function createSelectionFromTerritory(territory: FormiqTerritory): TerritorySelection {
  return createTerritorySelection(
    territory.geometry.geometry.coordinates[0] ?? [],
    territory.shape ?? inferSelectionShape(territory.geometry.geometry.coordinates[0] ?? [])
  );
}

export function inferSelectionShape(coordinates: Position[]): TerritorySelectionShape {
  return isRectangleRing(coordinates) ? "rectangle" : "polygon";
}

export function createBoundingBox(coordinates: Position[]): BoundingBox {
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

export function closeRing(coordinates: Position[]): Position[] {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) {
    return coordinates;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

export function toPolygonCoordinates(selection: TerritorySelection): Position[] {
  return closeRing(selection.geometry.geometry.coordinates[0] ?? []);
}

export function convertSelectionShape(
  selection: TerritorySelection,
  targetShape: TerritorySelectionShape
): TerritorySelection {
  if (selection.shape === targetShape) {
    return selection;
  }

  if (targetShape === "rectangle") {
    const bounds = selection.bounds;
    return createTerritorySelection(
      createRectangleCoordinates([bounds.west, bounds.south], [bounds.east, bounds.north]),
      "rectangle"
    );
  }

  return createTerritorySelection(toPolygonCoordinates(selection), "polygon");
}

export function translateSelectionCoordinates(
  coordinates: Position[],
  deltaLng: number,
  deltaLat: number
): Position[] {
  return closeRing(
    coordinates.slice(0, -1).map(([lng, lat]) => [lng + deltaLng, lat + deltaLat] as Position)
  );
}

export function updatePolygonVertex(
  coordinates: Position[],
  vertexIndex: number,
  nextPosition: Position
): Position[] {
  const openCoordinates = coordinates.slice(0, -1);
  const nextCoordinates = openCoordinates.map((coordinate, index) =>
    index === vertexIndex ? nextPosition : coordinate
  );

  return closeRing(nextCoordinates);
}

export function getRectangleFrame(coordinates: Position[]): RectangleFrame {
  const ring = closeRing(coordinates).slice(0, 4);
  const [sw, se, , nw] = ring;

  if (!sw || !se || !nw) {
    throw new Error("Rectangle frame requires four corners");
  }

  const xVector: Position = [se[0] - sw[0], se[1] - sw[1]];
  const yVector: Position = [nw[0] - sw[0], nw[1] - sw[1]];
  const width = Math.max(length(xVector), MIN_RECTANGLE_SIZE);
  const height = Math.max(length(yVector), MIN_RECTANGLE_SIZE);

  return {
    center: [(sw[0] + ring[2][0]) / 2, (sw[1] + ring[2][1]) / 2],
    xAxis: normalize(xVector),
    yAxis: normalize(yVector),
    halfWidth: width / 2,
    halfHeight: height / 2,
  };
}

export function rotateRectangleCoordinates(
  coordinates: Position[],
  angleDelta: number
): Position[] {
  const frame = getRectangleFrame(coordinates);
  const rotatedXAxis = rotateVector(frame.xAxis, angleDelta);
  const rotatedYAxis = rotateVector(frame.yAxis, angleDelta);

  return createRectangleFromFrame({
    ...frame,
    xAxis: rotatedXAxis,
    yAxis: rotatedYAxis,
  });
}

export function resizeRectangleCoordinates(
  coordinates: Position[],
  handleId: string,
  pointer: Position
): Position[] {
  const frame = getRectangleFrame(coordinates);
  const local = toLocal(pointer, frame);

  const limits = {
    minX: -frame.halfWidth,
    maxX: frame.halfWidth,
    minY: -frame.halfHeight,
    maxY: frame.halfHeight,
  };

  switch (handleId) {
    case "corner-sw":
      limits.minX = Math.min(local[0], frame.halfWidth - MIN_RECTANGLE_SIZE);
      limits.minY = Math.min(local[1], frame.halfHeight - MIN_RECTANGLE_SIZE);
      break;
    case "corner-se":
      limits.maxX = Math.max(local[0], -frame.halfWidth + MIN_RECTANGLE_SIZE);
      limits.minY = Math.min(local[1], frame.halfHeight - MIN_RECTANGLE_SIZE);
      break;
    case "corner-ne":
      limits.maxX = Math.max(local[0], -frame.halfWidth + MIN_RECTANGLE_SIZE);
      limits.maxY = Math.max(local[1], -frame.halfHeight + MIN_RECTANGLE_SIZE);
      break;
    case "corner-nw":
      limits.minX = Math.min(local[0], frame.halfWidth - MIN_RECTANGLE_SIZE);
      limits.maxY = Math.max(local[1], -frame.halfHeight + MIN_RECTANGLE_SIZE);
      break;
    case "edge-west":
      limits.minX = Math.min(local[0], frame.halfWidth - MIN_RECTANGLE_SIZE);
      break;
    case "edge-east":
      limits.maxX = Math.max(local[0], -frame.halfWidth + MIN_RECTANGLE_SIZE);
      break;
    case "edge-south":
      limits.minY = Math.min(local[1], frame.halfHeight - MIN_RECTANGLE_SIZE);
      break;
    case "edge-north":
      limits.maxY = Math.max(local[1], -frame.halfHeight + MIN_RECTANGLE_SIZE);
      break;
    default:
      return coordinates;
  }

  return createRectangleFromLocalLimits(frame, limits.minX, limits.maxX, limits.minY, limits.maxY);
}

export function getRectangleRotationAngle(
  coordinates: Position[],
  startPointer: Position,
  nextPointer: Position
): number {
  const frame = getRectangleFrame(coordinates);
  const startAngle = Math.atan2(startPointer[1] - frame.center[1], startPointer[0] - frame.center[0]);
  const nextAngle = Math.atan2(nextPointer[1] - frame.center[1], nextPointer[0] - frame.center[0]);
  return nextAngle - startAngle;
}

function createSelectionHandleFeatures(selection: TerritorySelection): Feature<Point, SelectionHandleFeatureProperties>[] {
  const coordinates = toPolygonCoordinates(selection);

  if (selection.shape === "rectangle" && isRectangleRing(coordinates)) {
    const frame = getRectangleFrame(coordinates);
    const offset = Math.max(Math.max(frame.halfWidth, frame.halfHeight) * 0.65, MIN_ROTATE_HANDLE_OFFSET);

    return [
      createHandleFeature(worldFromLocal(frame, -frame.halfWidth, -frame.halfHeight), "corner-sw", "corner"),
      createHandleFeature(worldFromLocal(frame, frame.halfWidth, -frame.halfHeight), "corner-se", "corner"),
      createHandleFeature(worldFromLocal(frame, frame.halfWidth, frame.halfHeight), "corner-ne", "corner"),
      createHandleFeature(worldFromLocal(frame, -frame.halfWidth, frame.halfHeight), "corner-nw", "corner"),
      createHandleFeature(worldFromLocal(frame, 0, -frame.halfHeight), "edge-south", "edge"),
      createHandleFeature(worldFromLocal(frame, frame.halfWidth, 0), "edge-east", "edge"),
      createHandleFeature(worldFromLocal(frame, 0, frame.halfHeight), "edge-north", "edge"),
      createHandleFeature(worldFromLocal(frame, -frame.halfWidth, 0), "edge-west", "edge"),
      createHandleFeature(worldFromLocal(frame, 0, frame.halfHeight + offset), "rotate", "rotate"),
    ];
  }

  return coordinates.slice(0, -1).map((coordinate, index) =>
    createHandleFeature(coordinate, `vertex-${index}`, "vertex", index)
  );
}

function createHandleFeature(
  coordinates: Position,
  handleId: string,
  handleKind: SelectionHandleFeatureProperties["handleKind"],
  vertexIndex?: number
): Feature<Point, SelectionHandleFeatureProperties> {
  return {
    type: "Feature",
    properties: {
      featureType: "selection-handle",
      handleId,
      handleKind,
      vertexIndex,
    },
    geometry: {
      type: "Point",
      coordinates,
    },
  };
}

function isClosedRing(coordinates: Position[]): boolean {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  return Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
}

function isRectangleRing(coordinates: Position[]): boolean {
  const ring = closeRing(coordinates);

  if (ring.length !== 5) {
    return false;
  }

  const frame = getRectangleFrameUnsafe(ring);

  if (!frame) {
    return false;
  }

  const expected = createRectangleFromFrame(frame);
  return expected.every((point, index) => arePointsClose(point, ring[index]));
}

function getRectangleFrameUnsafe(coordinates: Position[]): RectangleFrame | null {
  try {
    return getRectangleFrame(coordinates);
  } catch {
    return null;
  }
}

function createRectangleFromLocalLimits(
  frame: RectangleFrame,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Position[] {
  const centerLocalX = (minX + maxX) / 2;
  const centerLocalY = (minY + maxY) / 2;
  const nextCenter = worldFromLocal(frame, centerLocalX, centerLocalY);

  return createRectangleFromFrame({
    center: nextCenter,
    xAxis: frame.xAxis,
    yAxis: frame.yAxis,
    halfWidth: Math.max(Math.abs(maxX - minX) / 2, MIN_RECTANGLE_SIZE / 2),
    halfHeight: Math.max(Math.abs(maxY - minY) / 2, MIN_RECTANGLE_SIZE / 2),
  });
}

function createRectangleFromFrame(frame: RectangleFrame): Position[] {
  const sw = worldFromLocal(frame, -frame.halfWidth, -frame.halfHeight);
  const se = worldFromLocal(frame, frame.halfWidth, -frame.halfHeight);
  const ne = worldFromLocal(frame, frame.halfWidth, frame.halfHeight);
  const nw = worldFromLocal(frame, -frame.halfWidth, frame.halfHeight);

  return [sw, se, ne, nw, sw];
}

function worldFromLocal(frame: RectangleFrame, localX: number, localY: number): Position {
  return [
    frame.center[0] + frame.xAxis[0] * localX + frame.yAxis[0] * localY,
    frame.center[1] + frame.xAxis[1] * localX + frame.yAxis[1] * localY,
  ];
}

function toLocal(point: Position, frame: RectangleFrame): Position {
  const vector: Position = [point[0] - frame.center[0], point[1] - frame.center[1]];

  return [
    dot(vector, frame.xAxis),
    dot(vector, frame.yAxis),
  ];
}

function rotateVector(vector: Position, angle: number): Position {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [
    vector[0] * cos - vector[1] * sin,
    vector[0] * sin + vector[1] * cos,
  ];
}

function normalize(vector: Position): Position {
  const size = Math.max(length(vector), MIN_RECTANGLE_SIZE);
  return [vector[0] / size, vector[1] / size];
}

function dot(left: Position, right: Position): number {
  return left[0] * right[0] + left[1] * right[1];
}

function length(vector: Position): number {
  return Math.hypot(vector[0], vector[1]);
}

function arePointsClose(left: Position, right: Position): boolean {
  return Math.abs(left[0] - right[0]) < 0.000001 && Math.abs(left[1] - right[1]) < 0.000001;
}
