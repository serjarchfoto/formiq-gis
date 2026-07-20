import { describe, expect, it } from "vitest";
import { ARCGIS_REST_FIXTURE, CKAN_FIXTURE, EMPTY_RESULT_FIXTURE, GEOJSON_FIXTURE, INVALID_GEOMETRY_FIXTURE, OVERPASS_FIXTURE, RATE_LIMIT_FIXTURE, STAC_FIXTURE, TIMEOUT_FIXTURE, WFS_FIXTURE } from "./sourceFixtures";

describe("Data Hub source fixtures", () => {
  it("provides every offline CI source and failure fixture", () => {
    expect(OVERPASS_FIXTURE.elements).toHaveLength(1);
    expect(WFS_FIXTURE.features).toHaveLength(1);
    expect(ARCGIS_REST_FIXTURE.features).toHaveLength(1);
    expect(CKAN_FIXTURE.result.results[0]?.format).toBe("GeoJSON");
    expect(STAC_FIXTURE.features[0]?.assets.image.type).toBe("image/tiff");
    expect(GEOJSON_FIXTURE.features).toHaveLength(1);
    expect(Number.isNaN(INVALID_GEOMETRY_FIXTURE.features[0]?.geometry.coordinates[0])).toBe(true);
    expect(EMPTY_RESULT_FIXTURE.features).toEqual([]);
    expect(RATE_LIMIT_FIXTURE.status).toBe(429);
    expect(TIMEOUT_FIXTURE.status).toBe(408);
  });
});
