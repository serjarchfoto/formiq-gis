import type { FeatureCollection, Point } from "geojson";
import type { BoundingBox } from "@/types/gis";

export interface TerrainSamplePoint {
  longitude: number;
  latitude: number;
  elevation: number | null;
}

export type TerrainSourceId =
  | "open-topography"
  | "copernicus-dem"
  | "nasa-srtm"
  | "open-elevation"
  | "aster-gdem"
  | "mapbox-terrain";

export interface TerrainSourceCandidate {
  id: TerrainSourceId;
  endpoint: string;
}

export interface TerrainDataset {
  source: TerrainSourceId;
  sampledAt: string;
  gridSize: number;
  points: TerrainSamplePoint[];
  status: "ready" | "loading" | "not-configured" | "rate-limited" | "offline" | "error";
  message: string;
  demType: string;
}

export class TerrainService {
  private readonly candidates: TerrainSourceCandidate[];

  constructor(endpointOrOptions?: string | { candidates?: TerrainSourceCandidate[] }) {
    if (typeof endpointOrOptions === "string") {
      this.candidates = [{ id: "open-topography", endpoint: endpointOrOptions }];
      return;
    }

    this.candidates = endpointOrOptions?.candidates ?? createTerrainCandidates();
  }

  async loadDEM(bbox: BoundingBox, signal?: AbortSignal): Promise<TerrainDataset> {
    const payload = await this.loadRawDEM(bbox, signal);
    const points = payload.features.map((feature) => ({
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      elevation:
        typeof feature.properties?.elevation === "number"
          ? feature.properties.elevation
          : null,
    }));

    return {
      source: payload.metadata?.sourceId ?? "open-topography",
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

  async loadRawDEM(bbox: BoundingBox, signal?: AbortSignal): Promise<TerrainProxyResponse> {
    const errors: string[] = [];
    let lastPayload: TerrainProxyResponse | null = null;

    for (const candidate of this.candidates) {
      if (signal?.aborted) throw new DOMException("The DEM request was aborted.", "AbortError");

      const markName = `terrain:fetch:start:${candidate.id}`;
      const measureName = `terrain:fetch:${candidate.id}`;
      performance.mark(markName);
      try {
        const url = `${candidate.endpoint}?bbox=${encodeURIComponent(formatBbox(bbox))}`;
        const response = await fetch(url, {
          headers: { Accept: "application/geo+json, application/json" },
          cache: "no-store",
          signal,
        });

        if (!response.ok) throw new Error(`DEM request failed with status ${response.status}.`);
        const payload = (await response.json()) as TerrainProxyResponse;
        lastPayload = {
          ...payload,
          metadata: { ...payload.metadata, sourceId: candidate.id },
        };

        const status = payload.metadata?.status;
        const hasSamples = payload.features.length > 0;
        if (hasSamples && status !== "error" && status !== "offline" && status !== "not-configured") {
          return lastPayload;
        }

        errors.push(`${candidate.id}: ${payload.metadata?.message || "no elevation samples"}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "request failed"}`);
      } finally {
        if (typeof performance.measure === "function") {
          try {
            performance.measure(measureName, markName);
          } catch {
            // Older browsers can reject duplicate marks; telemetry must not affect import.
          }
        }
      }
    }

    if (lastPayload) {
      return {
        ...lastPayload,
        metadata: {
          ...lastPayload.metadata,
          status: lastPayload.metadata?.status ?? "error",
          message: errors.join("; "),
          fallbackErrors: errors.join(" | "),
        },
      };
    }

    throw new Error(errors.join("; ") || "No DEM source is configured.");
  }
}

export type TerrainProxyResponse = FeatureCollection<
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
    sourceId?: TerrainSourceId;
    fallbackErrors?: string;
  };
};

function createTerrainCandidates(): TerrainSourceCandidate[] {
  const candidates: TerrainSourceCandidate[] = [
    {
      id: "open-topography",
      endpoint: process.env.NEXT_PUBLIC_OPEN_TOPOGRAPHY_API_URL || "/api/data/opentopography",
    },
    {
      id: "open-elevation",
      endpoint: process.env.NEXT_PUBLIC_OPEN_ELEVATION_API_URL || "/api/data/open-elevation",
    },
  ];

  const configured = [
    ["nasa-srtm", process.env.NEXT_PUBLIC_NASA_SRTM_API_URL],
    ["aster-gdem", process.env.NEXT_PUBLIC_ASTER_GDEM_API_URL],
    ["mapbox-terrain", process.env.NEXT_PUBLIC_MAPBOX_TERRAIN_API_URL],
  ] as const;

  for (const [id, endpoint] of configured) {
    if (endpoint?.trim()) candidates.push({ id, endpoint: endpoint.trim() });
  }

  return candidates;
}

function formatBbox(bbox: BoundingBox): string {
  return [bbox.west, bbox.south, bbox.east, bbox.north].join(",");
}
