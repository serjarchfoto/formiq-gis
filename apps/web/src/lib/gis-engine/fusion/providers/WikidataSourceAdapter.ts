import type { SourceAdapter, SourceAdapterResult } from "@/lib/gis-engine/fusion/types";
import { WikidataService } from "@/services/wikidata";

export class WikidataSourceAdapter implements SourceAdapter {
  readonly source = "wikidata" as const;
  readonly version = "v1";

  constructor(private readonly service = new WikidataService()) {}

  async fetch({ bounds }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const rows = await this.service.loadByBoundingBox(bounds);

    return {
      source: this.source,
      version: this.version,
      features: rows
        .filter((row) => row.coordinates)
        .map((row) => ({
          source: "wikidata" as const,
          sourceFeatureId: row.id,
          kind: "poi" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [row.coordinates!.longitude, row.coordinates!.latitude] as [number, number],
          },
          tags: row.tags,
          names: row.label ? { default: row.label } : undefined,
          category: "wikidata",
          subtype: row.description,
          name: row.label,
        })),
    };
  }
}
