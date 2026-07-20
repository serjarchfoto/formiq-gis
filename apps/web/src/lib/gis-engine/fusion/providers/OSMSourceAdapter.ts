import type { BoundingBox } from "@/types/gis";
import type {
  SourceAdapter,
  SourceAdapterRawResult,
  SourceAdapterResult,
} from "@/lib/gis-engine/fusion/types";
import { normalizeOsmRawResultToLegacySourceFeatures } from "@/lib/gis-engine/data-hub/normalizers";
import { OSMService } from "@/services/osm";

const MAX_TILE_COUNT_PER_AXIS = 12;
const TARGET_TILE_SIZE_DEGREES = 0.035;
const TILED_IMPORT_THRESHOLD_DEGREES = 0.05;

export class OSMSourceAdapter implements SourceAdapter {
  readonly source = "osm" as const;
  readonly version = "v1";

  constructor(private readonly service = new OSMService()) {}

  /**
   * @deprecated Compatibility entry point for the existing fusion pipeline.
   * New ingestion must call fetchRaw() and normalize through Data Hub.
   */
  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    const features = await normalizeOsmRawResultToLegacySourceFeatures(raw);

    return {
      source: this.source,
      version: this.version,
      features,
    };
  }

  async fetchRaw({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterRawResult> {
    const tiledResult = shouldUseTiledImport(bounds)
      ? await this.loadByTiles(bounds, signal)
      : { responses: [await this.service.loadByBoundingBox(bounds, signal)], errors: [] as Error[] };

    return {
      source: this.source,
      version: this.version,
      payload: { format: "overpass", responses: tiledResult.responses },
      metadata: tiledResult.errors.length > 0
        ? {
            status: "partial",
            message: `Overpass: пропущено ${tiledResult.errors.length} из ${tiledResult.responses.length + tiledResult.errors.length} подзапросов.`,
            failedRequests: tiledResult.errors.length,
          }
        : { status: "ready" },
    };
  }

  private async loadByTiles(bounds: BoundingBox, signal?: AbortSignal): Promise<{
    responses: Awaited<ReturnType<OSMService["loadByBoundingBox"]>>[];
    errors: Error[];
  }> {
    const tiles = splitBoundingBox(bounds);
    const responses: Awaited<ReturnType<OSMService["loadByBoundingBox"]>>[] = [];
    const errors: Error[] = [];

    for (const tile of tiles) {
      try {
        responses.push(await this.service.loadByBoundingBox(tile, signal));
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error("Unknown Overpass tile error."));
      }
    }

    return { responses, errors };
  }
}

function shouldUseTiledImport(bounds: BoundingBox): boolean {
  return (
    Math.abs(bounds.east - bounds.west) > TILED_IMPORT_THRESHOLD_DEGREES ||
    Math.abs(bounds.north - bounds.south) > TILED_IMPORT_THRESHOLD_DEGREES
  );
}

function splitBoundingBox(bounds: BoundingBox): BoundingBox[] {
  const width = Math.max(bounds.east - bounds.west, 0);
  const height = Math.max(bounds.north - bounds.south, 0);
  const columns = clampTileCount(Math.ceil(width / TARGET_TILE_SIZE_DEGREES));
  const rows = clampTileCount(Math.ceil(height / TARGET_TILE_SIZE_DEGREES));
  const tileWidth = width / columns;
  const tileHeight = height / rows;
  const tiles: BoundingBox[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        west: bounds.west + tileWidth * column,
        south: bounds.south + tileHeight * row,
        east: column === columns - 1 ? bounds.east : bounds.west + tileWidth * (column + 1),
        north: row === rows - 1 ? bounds.north : bounds.south + tileHeight * (row + 1),
      });
    }
  }

  return tiles;
}

function clampTileCount(value: number): number {
  return Math.min(Math.max(value, 1), MAX_TILE_COUNT_PER_AXIS);
}
