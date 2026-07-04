import type { BoundingBox } from "@/types/gis";

export interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}

export interface OverpassElement {
  id: number;
  type: "node" | "way" | "relation";
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

export class OverpassService {
  async loadArchitecturalContext(bbox: BoundingBox): Promise<OverpassResponse> {
    const query = this.createArchitecturalContextQuery(bbox);

    return this.query(query);
  }

  async query(query: string): Promise<OverpassResponse> {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed with status ${response.status}.`);
    }

    return response.json() as Promise<OverpassResponse>;
  }

  private createArchitecturalContextQuery(bbox: BoundingBox): string {
    const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    return `
      [out:json][timeout:25];
      (
        way["building"](${box});
        way["highway"](${box});
        way["natural"="water"](${box});
        way["water"](${box});
        way["waterway"~"riverbank|canal"](${box});
        way["landuse"~"grass|forest|meadow|recreation_ground|village_green"](${box});
        way["leisure"~"park|garden"](${box});
        way["natural"~"wood|grassland|scrub"](${box});
      );
      out geom;
    `;
  }
}
