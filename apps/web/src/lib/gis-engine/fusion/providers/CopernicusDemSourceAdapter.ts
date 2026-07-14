import type { Point } from "geojson";
import type { SourceAdapter, SourceAdapterResult, SourceTerrainFeature } from "@/lib/gis-engine/fusion/types";
import { TerrainService } from "@/services/terrain";

export class CopernicusDemSourceAdapter implements SourceAdapter {
  readonly source = "copernicus-dem" as const;
  readonly version = "opentopography-v1";

  constructor(private readonly service = new TerrainService()) {}

  async fetch({ bounds }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const dataset = await this.service.loadDEM(bounds);

    return {
      source: this.source,
      version: this.version,
      metadata: {
        status: dataset.status,
        message: dataset.message,
        demType: dataset.demType,
        gridSize: dataset.gridSize,
        sampledAt: dataset.sampledAt,
      },
      features: dataset.points.map<SourceTerrainFeature>((point, index) => ({
        kind: "terrain",
        source: this.source,
        sourceFeatureId: `copernicus-dem-${index}-${point.longitude}-${point.latitude}`,
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        } satisfies Point,
        elevation: point.elevation,
        slope: null,
        tags: {
          source: "open-topography",
          demType: dataset.demType,
        },
      })),
    };
  }
}
