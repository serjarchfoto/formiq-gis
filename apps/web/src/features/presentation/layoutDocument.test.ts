import { describe, expect, it } from "vitest";
import { buildLayoutDocument, createPageDefinition, getRasterPixelSize } from "./layoutDocument";
import { createRasterPdfAlbum, SvgLayoutRenderer } from "./renderers";

describe("LayoutDocument", () => {
  it("keeps physical page dimensions independent from preview zoom", () => {
    const page = createPageDefinition("A3", "landscape", 15);
    const document = buildLayoutDocument({
      previewZoom: 55,
      rasterDpi: 300,
      page,
      map: { x: 10, y: 20, width: 100, height: 80, scaleDenominator: 2000, sourceCrs: "EPSG:4326", displayCrs: "EPSG:4326", thematicMapId: "building-floors" },
      elements: [],
      metadata: { title: "Test", subtitle: "", author: "", date: "", projectId: "p", projectName: "P", sourceCrs: "EPSG:4326", displayCrs: "EPSG:4326", provenance: [] },
      readiness: { state: "ready", coveragePercent: 100, knownCount: 1, totalCount: 1, summary: "ready" },
      svgMarkup: '<svg viewBox="0 0 1120 792" />',
    });
    expect(document.page.widthMm).toBe(420);
    expect(document.page.heightMm).toBe(297);
    expect(getRasterPixelSize(document, 300)).toEqual({ width: 4961, height: 3508 });
    const portrait = buildLayoutDocument({ ...document, page: createPageDefinition("A3", "portrait", 15) });
    expect(getRasterPixelSize(portrait, 300)).toEqual({ width: 3508, height: 4961 });
  });

  it("preserves readiness and serializable metadata", async () => {
    const page = createPageDefinition("A3", "portrait", 15);
    const document = buildLayoutDocument({ previewZoom: 55, rasterDpi: 300, page, map: { x: 0, y: 0, width: 1, height: 1, scaleDenominator: 0, sourceCrs: "EPSG:3857", displayCrs: "EPSG:4326", thematicMapId: "terrain-height" }, elements: [], metadata: { title: "No data", subtitle: "", author: "", date: "", projectId: "p", projectName: "P", sourceCrs: "EPSG:3857", displayCrs: "EPSG:4326", provenance: ["copernicus-dem"] }, readiness: { state: "no-data", coveragePercent: 0, knownCount: 0, totalCount: 0, summary: "missing elevation" }, svgMarkup: "<svg />" });
    expect(document.readiness.state).toBe("no-data");
    expect(document.page.widthMm).toBe(297);
    expect(document.page.heightMm).toBe(420);
    expect(document.metadata.displayCrs).toBe("EPSG:4326");
    expect(document.previewZoom).toBe(55);
    expect(document.map.scaleDenominator).toBe(0);
    await expect(SvgLayoutRenderer.render(document)).rejects.toThrow("missing elevation");
  });

  it("builds a multi-page raster PDF for an album", () => {
    const page = createPageDefinition("A3", "landscape", 5);
    const makeDocument = (title: string) => buildLayoutDocument({ previewZoom: 55, rasterDpi: 300, page, map: { x: 0, y: 0, width: 1, height: 1, scaleDenominator: 2000, sourceCrs: "EPSG:4326", displayCrs: "EPSG:4326", thematicMapId: title }, elements: [], metadata: { title, subtitle: "", author: "", date: "", projectId: "p", projectName: "P", sourceCrs: "EPSG:4326", displayCrs: "EPSG:4326", provenance: [] }, readiness: { state: "ready", coveragePercent: 100, knownCount: 1, totalCount: 1, summary: "ready" }, svgMarkup: "<svg />" });
    const pdf = createRasterPdfAlbum([{ width: 1, height: 1, png: new Uint8Array(), jpeg: new Uint8Array([1, 2, 3]) }, { width: 1, height: 1, png: new Uint8Array(), jpeg: new Uint8Array([4, 5, 6]) }], [makeDocument("one"), makeDocument("two")]);
    expect(new TextDecoder().decode(pdf)).toContain("/Count 2");
  });
});
