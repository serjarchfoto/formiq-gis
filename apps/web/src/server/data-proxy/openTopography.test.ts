import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenTopographyDem, parseAsciiGrid } from "./openTopography";

const asciiGrid = `ncols 3
nrows 2
xllcorner 10
yllcorner 20
cellsize 0.5
NODATA_value -9999
100 101 102
90 -9999 92`;

afterEach(() => {
  delete process.env.OPEN_TOPOGRAPHY_CACHE_DISABLED;
  vi.unstubAllGlobals();
});

describe("OpenTopography Data Proxy", () => {
  it("parses AAIGrid headers and values", () => {
    const parsed = parseAsciiGrid(asciiGrid);

    expect(parsed.ncols).toBe(3);
    expect(parsed.nrows).toBe(2);
    expect(parsed.values[1][1]).toBe(-9999);
  });

  it("converts AAIGrid into downsampled terrain GeoJSON points", async () => {
    process.env.OPEN_TOPOGRAPHY_CACHE_DISABLED = "1";
    const fetchMock = vi.fn(async () => new Response(asciiGrid, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOpenTopographyDem(
      [10, 20, 10.03, 20.02],
      "test-api-key",
      { maxSamples: 100 }
    );

    expect(result.features).toHaveLength(5);
    expect(result.features[0]?.geometry.coordinates).toEqual([10.25, 20.75]);
    expect(result.features[0]?.properties?.elevation).toBe(100);
    expect(result.features.some((feature) => feature.properties?.elevation === -9999)).toBe(false);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("outputFormat")).toBe("AAIGrid");
    expect(requestUrl.searchParams.get("demtype")).toBe("COP30");
    expect(requestUrl.searchParams.get("API_Key")).toBe("test-api-key");
  });
});
