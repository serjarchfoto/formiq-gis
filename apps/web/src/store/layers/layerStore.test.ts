import { beforeEach, describe, expect, it } from "vitest";
import { useLayers } from "./layerStore";

const sampleGeoJson = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [37.61, 55.75],
            [37.62, 55.75],
            [37.62, 55.76],
            [37.61, 55.76],
            [37.61, 55.75],
          ],
        ],
      },
    },
  ],
};

describe("layerStore", () => {
  beforeEach(() => {
    useLayers.getState().hydrateFromProject([]);
  });

  it("adds a GeoJSON layer, updates visibility and opacity, moves and removes it", async () => {
    const layer = await useLayers.getState().addLayer({
      name: "Test layer",
      data: sampleGeoJson,
      sourceType: "geojson",
    });

    expect(layer.name).toBe("Test layer");
    expect(layer.removable).toBe(true);
    expect(useLayers.getState().layers.some((item) => item.id === layer.id)).toBe(true);

    useLayers.getState().toggleLayer(layer.id);
    expect(useLayers.getState().layers.find((item) => item.id === layer.id)?.visible).toBe(false);

    useLayers.getState().setLayerOpacity(layer.id, 0.4);
    expect(useLayers.getState().layers.find((item) => item.id === layer.id)?.opacity).toBe(0.4);

    useLayers.getState().moveLayer(layer.id, -1);
    expect(useLayers.getState().layers.find((item) => item.id === layer.id)?.order).toBe(3);

    useLayers.getState().removeLayer(layer.id);
    expect(useLayers.getState().layers.some((item) => item.id === layer.id)).toBe(false);
  });
});
