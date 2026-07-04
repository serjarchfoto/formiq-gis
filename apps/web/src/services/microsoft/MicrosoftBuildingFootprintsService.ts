import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { BoundingBox } from "@/types/gis";

const DEFAULT_MICROSOFT_BUILDINGS_ENDPOINT =
  process.env.NEXT_PUBLIC_MICROSOFT_BUILDINGS_API_URL ?? "";

export class MicrosoftBuildingFootprintsService {
  constructor(private readonly endpoint = DEFAULT_MICROSOFT_BUILDINGS_ENDPOINT) {}

  async loadByBoundingBox(
    bounds: BoundingBox
  ): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
    if (!this.endpoint) {
      return createEmptyFeatureCollection();
    }

    const query = new URL(this.endpoint);
    query.searchParams.set("west", String(bounds.west));
    query.searchParams.set("south", String(bounds.south));
    query.searchParams.set("east", String(bounds.east));
    query.searchParams.set("north", String(bounds.north));

    const response = await fetch(query.toString(), {
      headers: {
        Accept: "application/geo+json, application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Microsoft Buildings request failed with status ${response.status}.`);
    }

    return response.json() as Promise<FeatureCollection<Geometry, GeoJsonProperties>>;
  }
}

function createEmptyFeatureCollection(): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}
