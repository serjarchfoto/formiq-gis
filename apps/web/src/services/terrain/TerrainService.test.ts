import { describe, expect, it, vi } from "vitest";
import { TerrainService } from "./TerrainService";

const bbox = { west: 37.6, south: 55.7, east: 37.61, north: 55.71 };

describe("TerrainService fallback chain", () => {
  it("uses the next configured DEM when the primary endpoint is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [37.605, 55.705] },
                properties: { elevation: 148 },
              },
            ],
            metadata: { status: "ready", demType: "SRTM30" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = new TerrainService({
      candidates: [
        { id: "open-topography", endpoint: "https://primary.test/dem" },
        { id: "nasa-srtm", endpoint: "https://secondary.test/dem" },
      ],
    });

    const dataset = await service.loadDEM(bbox);

    expect(dataset.source).toBe("nasa-srtm");
    expect(dataset.points[0]?.elevation).toBe(148);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
