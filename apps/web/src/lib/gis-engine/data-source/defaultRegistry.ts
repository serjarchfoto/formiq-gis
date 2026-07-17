import type { ImportSourceId } from "@/types/formiq";
import type { SourceAdapter } from "@/lib/gis-engine/fusion/types";
import { CityGeoJsonSourceAdapter } from "@/lib/gis-engine/fusion/providers/CityGeoJsonSourceAdapter";
import { CopernicusDemSourceAdapter } from "@/lib/gis-engine/fusion/providers/CopernicusDemSourceAdapter";
import { LocalBuildingsSourceAdapter } from "@/lib/gis-engine/fusion/providers/LocalBuildingsSourceAdapter";
import { MicrosoftBuildingSourceAdapter } from "@/lib/gis-engine/fusion/providers/MicrosoftBuildingSourceAdapter";
import { OSMSourceAdapter } from "@/lib/gis-engine/fusion/providers/OSMSourceAdapter";
import { OvertureSourceAdapter } from "@/lib/gis-engine/fusion/providers/OvertureSourceAdapter";
import { WikidataSourceAdapter } from "@/lib/gis-engine/fusion/providers/WikidataSourceAdapter";
import { SourceRegistry } from "./SourceRegistry";
import { SourceAdapterDataSource, UnavailableDataSource } from "./SourceAdapterDataSource";

export const DATA_SOURCE_LABELS: Record<ImportSourceId, string> = {
  osm: "OpenStreetMap / Overpass",
  "microsoft-buildings": "Microsoft Building Footprints",
  overture: "Overture Maps",
  "city-geojson": "City GeoJSON",
  "local-buildings": "Local Buildings",
  wikidata: "Wikidata POI",
  gtfs: "GTFS",
  "copernicus-dem": "OpenTopography / DEM",
  "sentinel-2": "Sentinel",
  "open-weather": "OpenWeather",
};

export function createDefaultSourceRegistry(sources: ImportSourceId[]): SourceRegistry {
  const registry = new SourceRegistry();

  for (const source of sources) {
    registry.register(createDefaultDataSource(source));
  }

  return registry;
}

export function createDefaultDataSource(source: ImportSourceId) {
  const adapter = createDefaultSourceAdapter(source);
  if (!adapter) return new UnavailableDataSource(source, DATA_SOURCE_LABELS[source]);

  if (source === "copernicus-dem") {
    return new SourceAdapterDataSource(adapter, DATA_SOURCE_LABELS[source], "online", {
      supportsTiles: true,
      cache: {
        ttlMs: 60 * 60 * 1000,
      },
    });
  }

  const mode = source === "osm" || source === "wikidata" ? "online" : "offline";
  return new SourceAdapterDataSource(adapter, DATA_SOURCE_LABELS[source], mode);
}

export function createDefaultSourceAdapter(source: ImportSourceId): SourceAdapter | null {
  if (source === "osm") return new OSMSourceAdapter();
  if (source === "microsoft-buildings") return new MicrosoftBuildingSourceAdapter();
  if (source === "overture") return new OvertureSourceAdapter();
  if (source === "city-geojson") return new CityGeoJsonSourceAdapter();
  if (source === "local-buildings") return new LocalBuildingsSourceAdapter();
  if (source === "wikidata") return new WikidataSourceAdapter();
  if (source === "copernicus-dem") return new CopernicusDemSourceAdapter();
  return null;
}
