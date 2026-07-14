import type { TileCoord } from "@/lib/gis-engine/tile-builder";

export type TileProviderKind = "mvt" | "pmtiles" | "mbtiles" | "postgis";

export interface TileMetadata {
  id: string;
  name: string;
  kind: TileProviderKind;
  minZoom: number;
  maxZoom: number;
  format: "mvt" | "png" | "jpg" | "webp";
  vectorLayers: string[];
}

export interface TileResponse {
  coord: TileCoord;
  contentType: string;
  data: Uint8Array;
  metadata: TileMetadata;
}

export interface TileProvider {
  readonly metadata: TileMetadata;
  getTile(coord: TileCoord): Promise<TileResponse | null>;
}
