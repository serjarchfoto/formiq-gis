import { describe, expect, it, vi } from "vitest";
import { ArcGisRestSourceAdapter } from "./ArcGisRestSourceAdapter";
import { CkanSourceAdapter } from "./CkanSourceAdapter";
import { GeoJsonSourceAdapter } from "./GeoJsonSourceAdapter";
import { StacSourceAdapter } from "./StacSourceAdapter";
import { WfsSourceAdapter } from "./WfsSourceAdapter";
import { ARCGIS_REST_FIXTURE, CKAN_FIXTURE, STAC_FIXTURE, WFS_FIXTURE } from "../../data-hub/fixtures/sourceFixtures";

const bounds = { west: 0, south: 0, east: 1, north: 1 };

describe("external source adapters", () => {
  it("fetches WFS GeoJSON pages with bbox and preserves CRS metadata", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(WFS_FIXTURE))
      .mockResolvedValueOnce(json({ type: "FeatureCollection", features: [], numberReturned: 0, crs: { properties: { name: "EPSG:4326" } } }));
    const adapter = new WfsSourceAdapter({ endpoint: "/proxy/wfs", typeName: "roads", pageSize: 1, fetcher });
    const raw = await adapter.fetchRaw({ bounds });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("bbox=0%2C0%2C1%2C1");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("typeNames=roads");
    expect(raw.metadata?.crs).toBe("EPSG:4326");
    expect(raw.payload.format).toBe("geojson");
  });

  it("accepts a simple GML/XML fallback without treating the document as HTML", async () => {
    const fetcher = vi.fn(async () => new Response("<wfs:FeatureCollection><gml:featureMember><gml:pos>0.5 0.5</gml:pos></gml:featureMember></wfs:FeatureCollection>", { status: 200, headers: { "content-type": "application/gml+xml" } }));
    const result = await new WfsSourceAdapter({ endpoint: "/proxy/wfs", fetcher }).fetch({ bounds });
    expect(result.features[0]?.geometry.type).toBe("Point");
    expect(result.metadata?.contentType).toBe("application/gml+xml");
  });

  it("converts ArcGIS REST Esri JSON and paginates result offsets", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ...ARCGIS_REST_FIXTURE, exceededTransferLimit: true }))
      .mockResolvedValueOnce(json({ features: [{ attributes: { OBJECTID: 2, category: "road" }, geometry: { paths: [[[1, 1], [2, 2]]] } }], exceededTransferLimit: false }));
    const adapter = new ArcGisRestSourceAdapter({ endpoint: "/proxy/arcgis", pageSize: 1, fetcher });
    const result = await adapter.fetch({ bounds });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("geometry=0%2C0%2C1%2C1");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("resultOffset=1");
    expect(result.features).toHaveLength(2);
    expect(result.features[0]?.kind).toBe("road");
  });

  it("keeps CKAN as a catalog and never emits geometry features", async () => {
    const fetcher = vi.fn(async () => json(CKAN_FIXTURE));
    const result = await new CkanSourceAdapter({ endpoint: "/proxy/ckan", fetcher }).fetch({ bounds });
    expect(result.features).toEqual([]);
    expect(result.metadata).toMatchObject({ catalog: true, geometrySource: false, resourceCount: 1 });
  });

  it("keeps STAC items/assets as catalog metadata without downloading raster assets", async () => {
    const fetcher = vi.fn(async () => json(STAC_FIXTURE));
    const result = await new StacSourceAdapter({ endpoint: "/proxy/stac", fetcher }).fetch({ bounds });
    expect(result.features).toEqual([]);
    expect(result.metadata).toMatchObject({ catalog: true, geometrySource: false, assetCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("bbox=0%2C0%2C1%2C1");
  });

  it("validates GeoJSON, applies domain mapping and enforces file size limits", async () => {
    const adapter = new GeoJsonSourceAdapter({
      input: { type: "FeatureCollection", features: [pointFeature("stop-1", { sourceType: "stop" })] },
      domainMapping: { sourceType: "transport-stop" as never },
    });
    const result = await adapter.fetch({ bounds });
    expect(result.features[0]?.kind).toBe("transit-stop");

    await expect(new GeoJsonSourceAdapter({ input: JSON.stringify({ type: "FeatureCollection", features: [] }), maxBytes: 2 }).fetch({ bounds }))
      .rejects.toThrow("size limit");
  });

  it("honors abort signals before network access", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    await expect(new WfsSourceAdapter({ fetcher }).fetch({ bounds, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function pointFeature(id: string, properties: Record<string, unknown>) {
  return { type: "Feature", id, properties, geometry: { type: "Point", coordinates: [0.5, 0.5] } };
}
