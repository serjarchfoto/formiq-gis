import { describe, expect, it } from "vitest";
import type { SourceFeature } from "../fusion/types";
import { processFeaturesIntoChunks } from "./processor";

describe("processFeaturesIntoChunks", () => {
  it("deduplicates adjacent bbox results and calculates chunk bounds", () => {
    const seen = new Set<string>();
    const first = processFeaturesIntoChunks(request("r0-c0", [point("a", 37, 55), point("b", 38, 56)]), seen);
    const second = processFeaturesIntoChunks(request("r0-c1", [point("b", 38, 56), point("c", 39, 57)]), seen);

    expect(first.duplicateCount).toBe(0);
    expect(first.chunks[0].bbox).toEqual({ west: 37, south: 55, east: 38, north: 56 });
    expect(second.duplicateCount).toBe(1);
    expect(second.chunks.flatMap((chunk) => chunk.geojson.features)).toHaveLength(1);
    expect(second.chunks[0].id).toContain("project-1:poi:r0-c1:osm:");
  });

  it("deduplicates identical boundary geometry even when fallback ids differ", () => {
    const seen = new Set<string>();
    processFeaturesIntoChunks(request("r0-c0", [point("fallback-a", 37, 55)]), seen);
    const adjacent = processFeaturesIntoChunks(request("r0-c1", [point("fallback-b", 37, 55)]), seen);

    expect(adjacent.duplicateCount).toBe(1);
    expect(adjacent.chunks).toHaveLength(0);
  });

  it("splits buildings at the target feature budget", () => {
    const features = Array.from({ length: 4_001 }, (_, index) => building(String(index)));
    const result = processFeaturesIntoChunks(request("r0-c0", features), new Set());

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].featureCount).toBe(4_000);
    expect(result.chunks[1].featureCount).toBe(1);
    expect(result.chunks.every((chunk) => chunk.byteSize <= 4 * 1024 * 1024)).toBe(true);
  });

  it("normalizes raw Overpass elements inside the worker processor", () => {
    const result = processFeaturesIntoChunks({
      requestId: "raw-osm",
      sessionId: "session-1",
      projectId: "project-1",
      tileId: "r0-c0",
      source: "osm",
      payload: {
        format: "overpass",
        responses: [{
          elements: [{
            id: 42,
            type: "way",
            tags: { building: "apartments", "building:levels": "7" },
            geometry: [
              { lon: 37, lat: 55 },
              { lon: 37.001, lat: 55 },
              { lon: 37.001, lat: 55.001 },
              { lon: 37, lat: 55 },
            ],
          }],
        }],
      },
    }, new Set());

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({ layerType: "buildings", featureCount: 1 });
    expect(result.chunks[0].geojson.features[0].properties?.levels).toBe(7);
  });

  it("converts raw DEM points to terrain chunks in the worker", () => {
    const result = processFeaturesIntoChunks({
      requestId: "raw-dem",
      sessionId: "session-1",
      projectId: "project-1",
      tileId: "r0-c0",
      source: "copernicus-dem",
      payload: {
        format: "terrain",
        demType: "COP30",
        features: [{
          type: "Feature",
          id: "dem-1",
          geometry: { type: "Point", coordinates: [37, 55] },
          properties: { elevation: 142 },
        }],
      },
    }, new Set());

    expect(result.chunks[0]).toMatchObject({ layerType: "terrain", featureCount: 1 });
    expect(result.chunks[0].geojson.features[0].properties?.elevation).toBe(142);
  });
});

function request(tileId: string, features: SourceFeature[]) {
  return {
    requestId: `request-${tileId}`,
    sessionId: "session-1",
    projectId: "project-1",
    tileId,
    source: "osm" as const,
    payload: { format: "source-features" as const, features },
  };
}

function point(id: string, longitude: number, latitude: number): SourceFeature {
  return {
    source: "osm",
    sourceFeatureId: id,
    kind: "poi",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    tags: { amenity: "cafe" },
  };
}

function building(id: string): SourceFeature {
  const offset = Number(id) * 0.000001;
  return {
    source: "osm",
    sourceFeatureId: id,
    kind: "building",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [37 + offset, 55],
        [37.0001 + offset, 55],
        [37.0001 + offset, 55.0001],
        [37 + offset, 55],
      ]],
    },
    tags: { building: "yes" },
  };
}
