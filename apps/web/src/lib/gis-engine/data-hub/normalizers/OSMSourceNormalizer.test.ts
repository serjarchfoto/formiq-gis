import { describe, expect, it } from "vitest";
import type { OverpassElement } from "@/services/overpass";
import { NormalizationPipeline } from "../NormalizationPipeline";
import type { CanonicalDomain, RawDataRecord, SourceFetchEnvelope } from "../types";
import { GenericGeoJsonNormalizer } from "./GenericGeoJsonNormalizer";
import { OSMSourceNormalizer } from "./OSMSourceNormalizer";

const acquiredAt = "2026-07-20T10:00:00.000Z";

const fixtures: Array<{ domain: CanonicalDomain; element: OverpassElement; geometryType: string }> = [
  { domain: "building", element: area(1, { building: "apartments", "building:levels": "5" }), geometryType: "Polygon" },
  { domain: "road", element: line(2, { highway: "residential", surface: "asphalt" }), geometryType: "LineString" },
  { domain: "waterbody", element: area(3, { natural: "water", water: "pond" }), geometryType: "Polygon" },
  { domain: "green_area", element: area(4, { leisure: "park" }), geometryType: "Polygon" },
  { domain: "poi", element: point(5, { amenity: "school", name: "School" }), geometryType: "Point" },
  { domain: "transport_stop", element: point(6, { highway: "bus_stop", name: "Stop" }), geometryType: "Point" },
  { domain: "boundary", element: { ...area(7, { boundary: "administrative", admin_level: "8" }), type: "relation" }, geometryType: "Polygon" },
];

describe("OSMSourceNormalizer", () => {
  it.each(fixtures)("normalizes $domain fixtures through the Data Hub pipeline", async ({ domain, element, geometryType }) => {
    const rawRecord = raw([element], domain);
    const result = await new NormalizationPipeline().normalize({
      envelope: envelope(domain, rawRecord.payload),
      rawRecord,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      sourceFeatureId: `osm-${element.type}-${element.id}`,
      domain,
      geometry: { type: geometryType },
      provenance: {
        sourceId: "osm",
        sourceType: "osm",
        rawRecordId: rawRecord.id,
        transformationSteps: expect.arrayContaining(["input-crs:EPSG:4326", "osm-tags-to-domain"]),
      },
    });
    expect(result.rawRecordIds).toEqual([rawRecord.id]);
  });

  it("reports an unclosed polygon and does not repair it silently", async () => {
    const element: OverpassElement = {
      id: 8,
      type: "way",
      tags: { building: "yes" },
      geometry: [{ lon: 37, lat: 55 }, { lon: 38, lat: 55 }, { lon: 38, lat: 56 }, { lon: 37, lat: 56 }],
    };
    const result = await normalize("building", [element]);

    expect(result.features).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "POLYGON_RING_NOT_CLOSED", severity: "error" }),
    ]));
  });

  it("reports missing tags without inventing a domain", async () => {
    const result = await normalize("building", [{ id: 9, type: "node", center: { lon: 37, lat: 55 } }]);

    expect(result.features).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "OSM_TAGS_MISSING", severity: "info" }),
    ]));
  });

  it("rejects invalid WGS84 coordinate values", async () => {
    const result = await normalize("poi", [point(10, { amenity: "cafe" }, { lon: 500, lat: 95 })]);

    expect(result.features).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "COORDINATE_OUT_OF_RANGE" }),
    ]));
  });
});

describe("GenericGeoJsonNormalizer CRS contract", () => {
  it("keeps unknown CRS coordinates unchanged, warns, and lowers confidence", async () => {
    const record = geoJsonRaw({});
    const result = await new GenericGeoJsonNormalizer().normalize([record], context("building", "file"));

    expect(result.features[0]?.geometryConfidence).toBe(0.45);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CRS_MISSING" })]));
    expect(result.features[0]?.provenance.transformationSteps).toContain("input-crs:unknown");
  });

  it("does not transform a declared unsupported CRS without an explicit rule", async () => {
    const record = geoJsonRaw({ inputCrs: "EPSG:3857" });
    const result = await new GenericGeoJsonNormalizer().normalize([record], context("building", "file"));

    expect(result.features).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CRS_TRANSFORM_UNAVAILABLE", severity: "error" })]));
  });
});

async function normalize(domain: CanonicalDomain, elements: OverpassElement[]) {
  const record = raw(elements, domain);
  return new OSMSourceNormalizer().normalize([record], context(domain, "osm"));
}

function raw(elements: OverpassElement[], domain: CanonicalDomain): RawDataRecord {
  return {
    id: `raw-${domain}`,
    ingestionRunId: "run-1",
    projectId: "project-1",
    territoryId: "territory-1",
    sourceId: "osm",
    domain,
    receivedAt: acquiredAt,
    sourceMetadata: { sourceType: "osm", inputCrs: "EPSG:4326" },
    payload: { format: "overpass", responses: [{ elements }] },
  };
}

function envelope(domain: CanonicalDomain, rawPayload: unknown): SourceFetchEnvelope {
  return {
    sourceId: "osm",
    domain,
    rawPayload,
    metadata: { sourceType: "osm", inputCrs: "EPSG:4326" },
    usedLegacyNormalization: false,
  };
}

function context(domain: CanonicalDomain, sourceType: string) {
  return {
    projectId: "project-1",
    territoryId: "territory-1",
    ingestionRunId: "run-1",
    sourceId: sourceType === "osm" ? "osm" : "file-source",
    sourceType,
    domain,
    rawRecordId: `raw-${domain}`,
    acquiredAt,
  };
}

function area(id: number, tags: Record<string, string>): OverpassElement {
  return {
    id,
    type: "way",
    tags,
    geometry: [
      { lon: 37, lat: 55 },
      { lon: 38, lat: 55 },
      { lon: 38, lat: 56 },
      { lon: 37, lat: 55 },
    ],
  };
}

function line(id: number, tags: Record<string, string>): OverpassElement {
  return { id, type: "way", tags, geometry: [{ lon: 37, lat: 55 }, { lon: 38, lat: 56 }] };
}

function point(
  id: number,
  tags: Record<string, string>,
  center: { lon: number; lat: number } = { lon: 37.5, lat: 55.5 }
): OverpassElement {
  return { id, type: "node", tags, center };
}

function geoJsonRaw(sourceMetadata: Record<string, unknown>): RawDataRecord {
  return {
    id: "raw-building",
    ingestionRunId: "run-1",
    projectId: "project-1",
    territoryId: "territory-1",
    sourceId: "file-source",
    domain: "building",
    receivedAt: acquiredAt,
    sourceMetadata,
    payload: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: "building-1",
        properties: { building: "yes" },
        geometry: { type: "Polygon", coordinates: [[[37, 55], [38, 55], [38, 56], [37, 55]]] },
      }],
    },
  };
}
