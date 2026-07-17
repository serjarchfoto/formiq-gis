import type { Feature, GeoJsonProperties, Geometry, Position } from "geojson";
import type { BoundingBox, GISLayerGeometryType } from "@/types/gis";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import { normalizeOverpassElement } from "@/lib/gis-engine/fusion/providers/OSMSourceAdapter";
import {
  normalizeBuildingFeature,
  normalizeGeneralGeoJsonFeature,
} from "@/lib/gis-engine/fusion/providers/GeoJsonProxySourceAdapter";
import type {
  ChunkProcessingRequest,
  ChunkProcessingResult,
  LayerChunkRecord,
  LayerChunkType,
} from "./types";

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_FEATURES: Record<LayerChunkType, number> = {
  buildings: 4_000,
  roads: 8_000,
  green: 5_000,
  water: 5_000,
  terrain: 10_000,
  boundaries: 5_000,
  poi: 10_000,
  transit: 10_000,
};

export function processFeaturesIntoChunks(
  request: ChunkProcessingRequest,
  seenFeatureKeys: Set<string>
): ChunkProcessingResult {
  const startedAt = now();
  const deduplicationStartedAt = now();
  const uniqueFeatures: SourceFeature[] = [];
  let duplicateCount = 0;

  for (const feature of normalizeWorkerPayload(request)) {
    const identityKey = `id:${feature.source}:${feature.kind}:${feature.sourceFeatureId}`;
    const geometryKey = createGeometryDeduplicationKey(feature);
    if (seenFeatureKeys.has(identityKey) || seenFeatureKeys.has(geometryKey)) {
      duplicateCount += 1;
      continue;
    }
    seenFeatureKeys.add(identityKey);
    seenFeatureKeys.add(geometryKey);
    uniqueFeatures.push(feature);
  }

  const deduplicationDurationMs = now() - deduplicationStartedAt;
  const grouped = new Map<LayerChunkType, Array<Feature<Geometry, GeoJsonProperties>>>();

  for (const feature of uniqueFeatures) {
    const layerType = getLayerType(feature);
    const collection = grouped.get(layerType) ?? [];
    collection.push(toGeoJsonFeature(feature));
    grouped.set(layerType, collection);
  }

  const chunks = Array.from(grouped.entries()).flatMap(([layerType, features]) =>
    createChunks(request, layerType, features)
  );

  return {
    requestId: request.requestId,
    chunks,
    features: uniqueFeatures,
    duplicateCount,
    processingDurationMs: now() - startedAt,
    deduplicationDurationMs,
  };
}

function createGeometryDeduplicationKey(feature: SourceFeature): string {
  let hash = 2_166_136_261;
  const update = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  };
  update(feature.geometry.type);
  visitPositions(feature.geometry, (position) => {
    update(`${position[0].toFixed(7)},${position[1].toFixed(7)};`);
  });
  update(feature.tags.name ?? "");
  update(feature.tags.amenity ?? "");
  update(feature.tags.building ?? "");
  return `geometry:${feature.source}:${feature.kind}:${hash >>> 0}`;
}

function normalizeWorkerPayload(request: ChunkProcessingRequest): SourceFeature[] {
  const payload = request.payload;
  if (payload.format === "source-features") return payload.features;

  if (payload.format === "overpass") {
    const features: SourceFeature[] = [];
    for (const response of payload.responses) {
      for (const element of response.elements) {
        features.push(...normalizeOverpassElement(element));
      }
    }
    return features;
  }

  if (payload.format === "terrain") {
    return payload.features.map((feature, index) => ({
      kind: "terrain" as const,
      source: request.source,
      sourceFeatureId: String(feature.id ?? `${request.source}-${request.tileId}-${index}`),
      geometry: feature.geometry,
      elevation:
        typeof feature.properties?.elevation === "number"
          ? feature.properties.elevation
          : null,
      slope: null,
      tags: { source: "open-topography", demType: payload.demType },
    }));
  }

  const normalize = payload.normalization === "building"
    ? normalizeBuildingFeature
    : normalizeGeneralGeoJsonFeature;
  const features: SourceFeature[] = [];
  payload.features.forEach((feature, index) => {
    features.push(...normalize(request.source, feature, index, payload.fallbackPrefix));
  });
  return features;
}

function createChunks(
  request: ChunkProcessingRequest,
  layerType: LayerChunkType,
  features: Array<Feature<Geometry, GeoJsonProperties>>
): LayerChunkRecord[] {
  const records: LayerChunkRecord[] = [];
  let current: Array<Feature<Geometry, GeoJsonProperties>> = [];
  let currentBytes = 0;

  const flush = () => {
    if (current.length === 0) return;
    const sequence = records.length;
    const geojson = { type: "FeatureCollection" as const, features: current };
    const byteSize = new TextEncoder().encode(JSON.stringify(geojson)).byteLength;
    const id = `${request.projectId}:${layerType}:${request.tileId}:${request.source}:${sequence}`;
    records.push({
      id,
      projectId: request.projectId,
      layerType,
      geometryType: getGeometryType(layerType),
      tileId: request.tileId,
      sequence,
      sourceIds: [request.source],
      featureCount: current.length,
      byteSize,
      bbox: calculateFeatureBounds(current),
      contentHash: createContentHash(current),
      createdAt: new Date().toISOString(),
      geojson,
    });
    current = [];
    currentBytes = 0;
  };

  for (const feature of features) {
    const featureBytes = new TextEncoder().encode(JSON.stringify(feature)).byteLength;
    if (
      current.length > 0 &&
      (current.length >= MAX_FEATURES[layerType] || currentBytes + featureBytes > MAX_CHUNK_BYTES)
    ) {
      flush();
    }
    current.push(feature);
    currentBytes += featureBytes;
  }
  flush();
  return records;
}

function getLayerType(feature: SourceFeature): LayerChunkType {
  if (feature.kind === "building") return "buildings";
  if (feature.kind === "road") return "roads";
  if (feature.kind === "vegetation") return "green";
  if (feature.kind === "water") return "water";
  if (feature.kind === "terrain") return "terrain";
  if (feature.kind === "boundary") return "boundaries";
  if (feature.kind === "transit-stop") return "transit";
  return "poi";
}

function getGeometryType(layerType: LayerChunkType): GISLayerGeometryType {
  if (layerType === "roads" || layerType === "boundaries") return "line";
  if (layerType === "poi" || layerType === "transit" || layerType === "terrain") return "point";
  return "polygon";
}

function toGeoJsonFeature(feature: SourceFeature): Feature<Geometry, GeoJsonProperties> {
  const { geometry, tags, names, ...properties } = feature;
  return {
    type: "Feature",
    id: feature.sourceFeatureId,
    geometry: simplifyGeometryPreservingShape(geometry),
    properties: {
      ...tags,
      ...properties,
      names: names ?? null,
      "_formiq:source": feature.source,
      "_formiq:kind": feature.kind,
      "_formiq:sourceFeatureId": feature.sourceFeatureId,
    },
  };
}

function simplifyGeometryPreservingShape(geometry: Geometry): Geometry {
  if (geometry.type === "LineString") {
    const coordinates = removeConsecutiveDuplicatePositions(geometry.coordinates);
    return coordinates.length >= 2 ? { ...geometry, coordinates } : geometry;
  }
  if (geometry.type === "MultiLineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line) => {
        const simplified = removeConsecutiveDuplicatePositions(line);
        return simplified.length >= 2 ? simplified : line;
      }),
    };
  }
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => simplifyRing(ring))
      ),
    };
  }
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(simplifyGeometryPreservingShape),
    };
  }
  return geometry;
}

function simplifyRing(ring: Position[]): Position[] {
  const simplified = removeConsecutiveDuplicatePositions(ring);
  if (simplified.length < 4) return ring;
  const first = simplified[0];
  const last = simplified.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    simplified.push([...first]);
  }
  return simplified.length >= 4 ? simplified : ring;
}

function removeConsecutiveDuplicatePositions(positions: Position[]): Position[] {
  return positions.filter((position, index) => {
    if (index === 0) return true;
    const previous = positions[index - 1];
    return !previous || previous[0] !== position[0] || previous[1] !== position[1];
  });
}

function calculateFeatureBounds(
  features: Array<Feature<Geometry, GeoJsonProperties>>
): BoundingBox | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const feature of features) {
    visitPositions(feature.geometry, (position) => {
      west = Math.min(west, position[0]);
      south = Math.min(south, position[1]);
      east = Math.max(east, position[0]);
      north = Math.max(north, position[1]);
    });
  }

  return Number.isFinite(west) ? { west, south, east, north } : null;
}

function visitPositions(geometry: Geometry, callback: (position: Position) => void): void {
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      callback(value as Position);
      return;
    }
    value.forEach(visit);
  };
  if ("coordinates" in geometry) visit(geometry.coordinates);
  if (geometry.type === "GeometryCollection") geometry.geometries.forEach((item) => visitPositions(item, callback));
}

function createContentHash(features: Array<Feature<Geometry, GeoJsonProperties>>): string {
  const first = features[0]?.id ?? "none";
  const last = features.at(-1)?.id ?? "none";
  return `${features.length}:${first}:${last}`;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
