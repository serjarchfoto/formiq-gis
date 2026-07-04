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

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

export class WikidataService {
  async loadByBoundingBox(bounds: BoundingBox): Promise<WikidataEntity[]> {
    const query = `
      SELECT ?item ?itemLabel ?itemDescription ?coord ?article WHERE {
        SERVICE wikibase:box {
          ?item wdt:P625 ?coord .
          bd:serviceParam wikibase:cornerWest "Point(${bounds.west} ${bounds.south})"^^geo:wktLiteral .
          bd:serviceParam wikibase:cornerEast "Point(${bounds.east} ${bounds.north})"^^geo:wktLiteral .
        }
        OPTIONAL {
          ?article schema:about ?item ;
                   schema:isPartOf <https://en.wikipedia.org/> .
        }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ru". }
      }
      LIMIT 500
    `;

    const response = await fetch(WIKIDATA_ENDPOINT, {
      headers: {
        Accept: "application/sparql-results+json",
      },
      method: "POST",
      body: new URLSearchParams({ query }),
    });

    if (!response.ok) {
      throw new Error(`Wikidata request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as WikidataResponse;

    return payload.results.bindings.map((row) => ({
      id: row.item.value,
      label: row.itemLabel?.value ?? null,
      description: row.itemDescription?.value ?? null,
      wikipedia: row.article?.value ?? null,
      coordinates: parsePoint(row.coord?.value),
      tags: {},
    }));
  }
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

function parsePoint(value: string | undefined): { latitude: number; longitude: number } | null {
  if (!value) {
    return null;
  }

  const match = value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);

  if (!match) {
    return null;
  }

  return {
    longitude: Number.parseFloat(match[1]),
    latitude: Number.parseFloat(match[2]),
  };
}
