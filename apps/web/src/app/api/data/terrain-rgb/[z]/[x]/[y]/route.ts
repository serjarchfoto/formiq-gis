import { NextResponse } from "next/server";
import {
  createFlatTerrainRgbTile,
  fetchOpenTopographyTerrainRgbTile,
  getTerrainRgbTileCacheStats,
} from "@/server/data-proxy/terrainRgb";

export const dynamic = "force-dynamic";

interface TerrainTileRouteParams {
  params: Promise<{
    z: string;
    x: string;
    y: string;
  }>;
}

export async function GET(request: Request, { params }: TerrainTileRouteParams) {
  const { z, x, y } = await params;
  const zoom = Number(z);
  const tileX = Number(x);
  const tileY = Number(y.replace(/\.png$/i, ""));
  const apiKey = process.env.OPEN_TOPOGRAPHY_API_KEY?.trim();

  if (!Number.isInteger(zoom) || !Number.isInteger(tileX) || !Number.isInteger(tileY)) {
    return NextResponse.json({ error: "Invalid terrain tile coordinates." }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") || "opentopography";
    const demType = searchParams.get("demType") || process.env.OPEN_TOPOGRAPHY_DEM_TYPE || "COP30";

    if (source !== "opentopography") {
      return createFlatTerrainTileResponse("unsupported-source", getTerrainRgbTileCacheStats().entries);
    }

    if (!apiKey) {
      return createFlatTerrainTileResponse("api-key-missing", getTerrainRgbTileCacheStats().entries);
    }

    const png = await fetchOpenTopographyTerrainRgbTile(zoom, tileX, tileY, apiKey, {
      demType,
      signal: AbortSignal.timeout(45_000),
    });
    const cacheStats = getTerrainRgbTileCacheStats();

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Formiq-Terrain-Cache-Entries": String(cacheStats.entries),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Terrain tile request failed.";
    return createFlatTerrainTileResponse(reason, getTerrainRgbTileCacheStats().entries);
  }
}

function createFlatTerrainTileResponse(reason: string, cacheEntries: number): Response {
  return new Response(new Uint8Array(createFlatTerrainRgbTile()), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Formiq-Terrain-Fallback": reason.slice(0, 120),
      "X-Formiq-Terrain-Cache-Entries": String(cacheEntries),
    },
  });
}
