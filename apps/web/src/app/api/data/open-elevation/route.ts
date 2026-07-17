import { NextResponse } from "next/server";
import type { Feature, Point } from "geojson";
import {
  createDataProxyCollection,
  parseBboxParam,
  type DataProxyBbox,
} from "@/server/data-proxy/readGeoJsonDataset";

export const dynamic = "force-dynamic";

/**
 * Small-grid Open-Elevation fallback. It is intentionally sampled (5×5) and
 * only called after the configured DEM providers return no usable samples.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = parseBboxParam(searchParams.get("bbox"));
  if (!bbox) {
    return NextResponse.json({ error: "Invalid bbox." }, { status: 400 });
  }

  try {
    const locations = createGrid(bbox, 5);
    const upstream = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${locations
        .map(([latitude, longitude]) => `${latitude},${longitude}`)
        .join("|")}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000), cache: "no-store" }
    );

    if (!upstream.ok) {
      return NextResponse.json(
        createDataProxyCollection("open-elevation", bbox, "", [], "offline", `Open-Elevation returned ${upstream.status}.`),
        { status: 200 }
      );
    }

    const payload = (await upstream.json()) as { results?: Array<{ latitude?: number; longitude?: number; elevation?: number }> };
    const features: Feature<Point, { elevation: number }>[] = (payload.results ?? [])
      .filter(
        (point) =>
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          Number.isFinite(point.elevation)
      )
      .map((point) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.longitude!, point.latitude!] },
        properties: { elevation: point.elevation! },
      }));

    return NextResponse.json(
      createDataProxyCollection(
        "open-elevation",
        bbox,
        "",
        features,
        features.length ? "ready" : "error",
        features.length ? undefined : "Open-Elevation returned no valid samples."
      )
    );
  } catch (error) {
    return NextResponse.json(
      createDataProxyCollection(
        "open-elevation",
        bbox,
        "",
        [],
        "offline",
        error instanceof Error ? error.message : "Open-Elevation is unavailable."
      ),
      { status: 200 }
    );
  }
}

function createGrid(bbox: DataProxyBbox, size: number): Array<[number, number]> {
  const [west, south, east, north] = bbox;
  const points: Array<[number, number]> = [];
  for (let row = 0; row < size; row += 1) {
    const latitude = south + ((north - south) * row) / (size - 1);
    for (let column = 0; column < size; column += 1) {
      const longitude = west + ((east - west) * column) / (size - 1);
      points.push([latitude, longitude]);
    }
  }
  return points;
}
