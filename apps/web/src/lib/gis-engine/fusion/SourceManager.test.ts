import { describe, expect, it } from "vitest";
import type { SourceAdapter, SourceFeature } from "./types";
import { SourceManager } from "./SourceManager";

const bounds = { west: 37.6, south: 55.7, east: 37.61, north: 55.71 };

describe("SourceManager safety budget", () => {
  it("stops before fusion when one source exceeds the feature budget", async () => {
    const manager = new SourceManager().register(createAdapter(3));

    await expect(manager.loadAll(bounds, { maxFeaturesPerSource: 2 })).rejects.toThrow(
      "Безопасный предел"
    );
  });

  it("stops before fusion when all sources exceed the total feature budget", async () => {
    const manager = new SourceManager()
      .register(createAdapter(2, "osm"))
      .register(createAdapter(2, "wikidata"));

    await expect(manager.loadAll(bounds, { maxFeaturesTotal: 3 })).rejects.toThrow(
      "Источники вернули более"
    );
  });

  it("loads registered providers in priority order and annotates fallback metadata", async () => {
    const manager = new SourceManager()
      .register(createAdapter(0, "osm"))
      .register(createAdapter(2, "microsoft-buildings"));

    const results = await manager.loadByPriority("buildings", bounds);

    expect(results.map((result) => result.source)).toEqual(["osm", "microsoft-buildings"]);
    expect(results[1]?.metadata?.priority).toBe("secondary");
    expect(results[1]?.metadata?.fallbackUsed).toBe(true);
  });
});

function createAdapter(
  featureCount: number,
  source: "osm" | "wikidata" | "microsoft-buildings" = "osm"
): SourceAdapter {
  return {
    source,
    version: "test-v1",
    async fetch() {
      return {
        source,
        version: "test-v1",
        features: Array.from({ length: featureCount }, (_, index) =>
          createPoiFeature(source, index)
        ),
      };
    },
  };
}

function createPoiFeature(
  source: "osm" | "wikidata" | "microsoft-buildings",
  index: number
): SourceFeature {
  return {
    kind: "poi",
    source,
    sourceFeatureId: `${source}-${index}`,
    geometry: { type: "Point", coordinates: [37.6, 55.7] },
    tags: {},
  };
}
