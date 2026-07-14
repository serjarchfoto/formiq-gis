import type { FeatureCollection, Point } from "geojson";
import type { BoundingBox } from "@/types/gis";

export interface WikidataEntity {
  id: string;
  label: string | null;
  description: string | null;
  wikipedia?: string | null;
  coordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  tags: Record<string, string>;
}

export class WikidataService {
  constructor(
    private readonly endpoint =
      process.env.NEXT_PUBLIC_WIKIDATA_API_URL || "/api/data/wikidata"
  ) {}

  async loadByBoundingBox(bounds: BoundingBox): Promise<WikidataEntity[]> {
    const url = `${this.endpoint}?bbox=${encodeURIComponent(formatBbox(bounds))}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json, application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Wikidata request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as WikidataProxyResponse;

    return payload.features.map((feature) => ({
      id: String(feature.id ?? feature.properties?.wikidataId ?? ""),
      label: toNullableString(feature.properties?.name),
      description: toNullableString(feature.properties?.description),
      wikipedia: toNullableString(feature.properties?.wikipedia),
      coordinates: {
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
      },
      tags: {
        wikidata: String(feature.properties?.wikidataId ?? feature.id ?? ""),
      },
    }));
  }
}

type WikidataProxyResponse = FeatureCollection<
  Point,
  {
    wikidataId?: unknown;
    name?: unknown;
    description?: unknown;
    wikipedia?: unknown;
  }
>;

function formatBbox(bounds: BoundingBox): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
