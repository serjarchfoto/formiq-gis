import type { Feature, Point } from "geojson";
import { NextResponse } from "next/server";
import {
  createDataProxyCollection,
  parseBboxParam,
} from "@/server/data-proxy/readGeoJsonDataset";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

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

  try {
    const response = await fetch(WIKIDATA_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "FORMIQ-GIS/0.1 (Wikidata data integration)",
      },
      body: new URLSearchParams({ query: createQuery(bbox) }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Wikidata request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as WikidataResponse;
    const features = payload.results.bindings.flatMap(toFeature);
    const status = "ready";
    const collection = createDataProxyCollection(
      "wikidata",
      bbox,
      WIKIDATA_ENDPOINT,
      features,
      status,
      features.length === 0 ? "Wikidata returned 0 POI in bbox" : undefined
    );

    return NextResponse.json(collection);
  } catch (error) {
    return NextResponse.json(
      createDataProxyCollection(
        "wikidata",
        bbox,
        WIKIDATA_ENDPOINT,
        [],
        "error",
        error instanceof Error ? error.message : "Wikidata request failed"
      ),
      { status: 502 }
    );
  }
}

function createQuery(bbox: [number, number, number, number]): string {
  return `
    SELECT ?item ?itemLabel ?itemDescription ?coord ?article WHERE {
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:cornerWest "Point(${bbox[0]} ${bbox[1]})"^^geo:wktLiteral .
        bd:serviceParam wikibase:cornerEast "Point(${bbox[2]} ${bbox[3]})"^^geo:wktLiteral .
      }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://ru.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    }
    LIMIT 500
  `;
}

function toFeature(binding: WikidataBinding): Array<Feature<Point>> {
  const coordinates = parsePoint(binding.coord?.value);

  if (!coordinates) {
    return [];
  }

  return [
    {
      type: "Feature",
      id: binding.item.value,
      geometry: {
        type: "Point",
        coordinates,
      },
      properties: {
        category: "poi",
        wikidataId: binding.item.value,
        name: binding.itemLabel?.value ?? null,
        description: binding.itemDescription?.value ?? null,
        wikipedia: binding.article?.value ?? null,
      },
    },
  ];
}

function parsePoint(value: string | undefined): [number, number] | null {
  const match = value?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

interface WikidataBinding {
  item: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  coord?: { value: string };
  article?: { value: string };
}

interface WikidataResponse {
  results: {
    bindings: WikidataBinding[];
  };
}
