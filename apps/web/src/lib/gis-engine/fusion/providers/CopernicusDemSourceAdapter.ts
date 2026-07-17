import type { Point } from "geojson";
import type {
  SourceAdapter,
  SourceAdapterRawResult,
  SourceAdapterResult,
  SourceTerrainFeature,
} from "@/lib/gis-engine/fusion/types";
import { TerrainService } from "@/services/terrain";

export class CopernicusDemSourceAdapter implements SourceAdapter {
  readonly source = "copernicus-dem" as const;
  readonly version = "opentopography-v1";

  constructor(private readonly service = new TerrainService()) {}

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const dataset = await this.service.loadDEM(bounds, signal);

    return {
      source: this.source,
      version: this.version,
      metadata: {
        status: dataset.status,
        message: dataset.message,
        sourceId: dataset.source,
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
          source: dataset.source,
          demType: dataset.demType,
        },
      })),
    };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const payload = await this.service.loadRawDEM(bounds, signal);
    const demType = payload.metadata?.demType ?? "COP30";
    return {
      source: this.source,
      version: this.version,
      payload: { format: "terrain", features: payload.features, demType },
      metadata: {
        status: payload.metadata?.status ?? "ready",
        message: payload.metadata?.message ?? "",
        demType,
        featureCount: payload.features.length,
      },
    };
  }
}
