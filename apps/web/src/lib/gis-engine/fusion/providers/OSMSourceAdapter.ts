import type { Geometry } from "geojson";
import type { BoundingBox } from "@/types/gis";
import type {
  SourceAdapter,
  SourceAdapterRawResult,
  SourceAdapterResult,
  SourceFeature,
} from "@/lib/gis-engine/fusion/types";
import { OSMService } from "@/services/osm";
import type { OverpassElement } from "@/services/overpass";

const MAX_TILE_COUNT_PER_AXIS = 12;
const TARGET_TILE_SIZE_DEGREES = 0.035;
const TILED_IMPORT_THRESHOLD_DEGREES = 0.05;

export class OSMSourceAdapter implements SourceAdapter {
  readonly source = "osm" as const;
  readonly version = "v1";

  constructor(private readonly service = new OSMService()) {}

  async fetch({ bounds, signal }: Parameters<SourceAdapter["fetch"]>[0]): Promise<SourceAdapterResult> {
    const raw = await this.fetchRaw({ bounds, signal });
    const responses = raw.payload.format === "overpass" ? raw.payload.responses : [];
    const features = deduplicateFeatures(
      responses.flatMap((response) => response.elements.flatMap((element) => normalizeOverpassElement(element)))
    );

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

function deduplicateFeatures(features: SourceFeature[]): SourceFeature[] {
  const seen = new Set<string>();

  return features.filter((feature) => {
    const key = `${feature.source}:${feature.sourceFeatureId}:${feature.kind}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeOverpassElement(element: OverpassElement): SourceFeature[] {
  const tags = element.tags ?? {};
  const geometry = toGeometry(element);

  if (!geometry) {
    return [];
  }

  const base = {
    source: "osm" as const,
    sourceFeatureId: `osm-${element.type}-${element.id}`,
    geometry,
    tags,
    names: tags.name ? { default: tags.name } : undefined,
  };

  if (geometry.type === "Point") {
    const transit = tags.public_transport || tags.highway === "bus_stop" || tags.railway;
    if (transit) {
      return [{
        ...base,
        kind: "transit-stop",
        network: tags.operator ?? tags.network ?? null,
        stopType: tags.public_transport ?? tags.highway ?? tags.railway ?? null,
        name: tags.name ?? null,
      }];
    }
    if (tags.amenity || tags.shop || tags.tourism || tags.office) {
      return [{
        ...base,
        kind: "poi",
        category: tags.amenity ?? tags.shop ?? tags.tourism ?? tags.office ?? "poi",
        subtype: tags["amenity:type"] ?? null,
        name: tags.name ?? null,
      }];
    }
  }

  if (tags.building) {
    return [
      {
        ...base,
        kind: "building",
        height: parseNumber(tags.height),
        levels: parseNumber(tags["building:levels"]),
        year: parseYear(tags.start_date ?? tags["building:year"] ?? tags.year),
        usage: tags.building ?? tags.amenity ?? tags.shop ?? tags.office ?? null,
        material: tags["building:material"] ?? tags.material ?? null,
        roof: tags["roof:shape"] ?? tags.roof ?? null,
        addressLabel: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || null,
        objectType: tags.building,
      },
    ];
  }

  if (tags.highway) {
    return [
      {
        ...base,
        kind: "road",
        roadType: tags.highway,
        surface: tags.surface ?? null,
        name: tags.name ?? null,
        lanes: parseNumber(tags.lanes),
      },
    ];
  }

  if (tags.natural === "water" || tags.water || tags.waterway) {
    return [
      {
        ...base,
        kind: "water",
        waterType: tags.water ?? tags.waterway ?? tags.natural ?? null,
      },
    ];
  }

  if (tags.landuse || tags.leisure === "park" || tags.leisure === "garden" || tags.natural) {
    return [
      {
        ...base,
        kind: "vegetation",
        vegetationType: tags.landuse ?? tags.leisure ?? tags.natural ?? null,
      },
    ];
  }

  return [];
}

function toGeometry(element: OverpassElement): Geometry | null {
  const coordinates = (element.geometry ?? []).map((point) => [point.lon, point.lat]);

  if (coordinates.length === 0 && element.center) {
    return { type: "Point", coordinates: [element.center.lon, element.center.lat] };
  }

  if (coordinates.length === 0) {
    return null;
  }

  if (coordinates.length === 1) {
    return { type: "Point", coordinates: coordinates[0] };
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const isClosed = Boolean(first && last && first[0] === last[0] && first[1] === last[1]);

  if (isClosed && coordinates.length >= 4) {
    return {
      type: "Polygon",
      coordinates: [coordinates],
    };
  }

  return {
    type: "LineString",
    coordinates,
  };
}

function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseYear(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\d{4}/);

  return match ? Number.parseInt(match[0], 10) : null;
}
