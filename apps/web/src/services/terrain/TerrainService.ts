import type { FeatureCollection, Point } from "geojson";
import type { BoundingBox } from "@/types/gis";

export interface TerrainSamplePoint {
  longitude: number;
  latitude: number;
  elevation: number | null;
}

export interface TerrainDataset {
  source: "open-topography";
  sampledAt: string;
  gridSize: number;
  points: TerrainSamplePoint[];
  status: "ready" | "loading" | "not-configured" | "rate-limited" | "offline" | "error";
  message: string;
  demType: string;
}

export class TerrainService {
  constructor(
    private readonly endpoint =
      process.env.NEXT_PUBLIC_OPEN_TOPOGRAPHY_API_URL || "/api/data/opentopography"
  ) {}

  async loadDEM(bbox: BoundingBox): Promise<TerrainDataset> {
    const url = `${this.endpoint}?bbox=${encodeURIComponent(formatBbox(bbox))}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json, application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`DEM request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as TerrainProxyResponse;
    const points = payload.features.map((feature) => ({
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      elevation:
        typeof feature.properties?.elevation === "number"
          ? feature.properties.elevation
          : null,
    }));

    return {
      source: "open-topography",
      sampledAt: payload.metadata?.generatedAt ?? new Date().toISOString(),
      gridSize: Math.max(
        0,
        Number(payload.metadata?.sourceRows) || 0,
        Number(payload.metadata?.sourceColumns) || 0
      ),
      points,
      status: payload.metadata?.status ?? "ready",
      message: payload.metadata?.message ?? "",
      demType: payload.metadata?.demType ?? "COP30",
    };
  }
}

type TerrainProxyResponse = FeatureCollection<
  Point,
  {
    elevation?: unknown;
  }
> & {
  metadata?: {
    status?: TerrainDataset["status"];
    message?: string;
    generatedAt?: string;
    demType?: string;
    sourceRows?: number;
    sourceColumns?: number;
  };
};

function formatBbox(bbox: BoundingBox): string {
  return [bbox.west, bbox.south, bbox.east, bbox.north].join(",");
}
