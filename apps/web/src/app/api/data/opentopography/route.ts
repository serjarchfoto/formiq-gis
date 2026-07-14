import { NextResponse } from "next/server";
import { fetchOpenTopographyDem } from "@/server/data-proxy/openTopography";
import {
  createDataProxyCollection,
  parseBboxParam,
} from "@/server/data-proxy/readGeoJsonDataset";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = parseBboxParam(searchParams.get("bbox"));

  if (!bbox) {
    return NextResponse.json(
      { error: "Invalid bbox. Use bbox=minLon,minLat,maxLon,maxLat." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPEN_TOPOGRAPHY_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      createDataProxyCollection(
        "open-topography",
        bbox,
        "",
        [],
        "not-configured",
        "OpenTopography API key is not configured"
      )
    );
  }

  try {
    const result = await fetchOpenTopographyDem(bbox, apiKey, {
      demType: process.env.OPEN_TOPOGRAPHY_DEM_TYPE || "COP30",
      maxSamples: Number(process.env.OPEN_TOPOGRAPHY_MAX_SAMPLES) || 4096,
      signal: AbortSignal.timeout(45_000),
    });
    const status = "ready";
    const collection = createDataProxyCollection(
      "open-topography",
      bbox,
      "",
      result.features,
      status,
      result.features.length === 0 ? "DEM returned 0 valid elevation samples" : undefined
    );

    return NextResponse.json({
      ...collection,
      metadata: {
        ...collection.metadata,
        demType: result.demType,
        sourceRows: result.sourceRows,
        sourceColumns: result.sourceColumns,
        sampleStride: result.sampleStride,
        cacheHits: result.cacheHits ?? 0,
        cacheMisses: result.cacheMisses ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenTopography request failed";
    const status = classifyOpenTopographyFailure(message);

    return NextResponse.json(
      createDataProxyCollection(
        "open-topography",
        bbox,
        "",
        [],
        status,
        getOpenTopographyFailureMessage(status, message)
      ),
      { status: status === "error" ? 502 : 200 }
    );
  }
}

function classifyOpenTopographyFailure(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("maximum rate") ||
    normalized.includes("50 api calls")
  ) {
    return "rate-limited" as const;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("temporarily") ||
    normalized.includes("503") ||
    normalized.includes("504")
  ) {
    return "offline" as const;
  }

  return "error" as const;
}

function getOpenTopographyFailureMessage(
  status: ReturnType<typeof classifyOpenTopographyFailure>,
  upstreamMessage: string
): string {
  if (status === "rate-limited") {
    return "OpenTopography rate limit reached: API maximum rate limit reached (50 API calls/24hrs).";
  }

  if (status === "offline") {
    return "OpenTopography is temporarily unavailable.";
  }

  return upstreamMessage;
}
