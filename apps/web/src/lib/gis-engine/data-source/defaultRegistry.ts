import type { ImportSourceId } from "@/types/formiq";
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
  if (source === "osm") {
    return new SourceAdapterDataSource(new OSMSourceAdapter(), DATA_SOURCE_LABELS[source], "online");
  }

  if (source === "microsoft-buildings") {
    return new SourceAdapterDataSource(new MicrosoftBuildingSourceAdapter(), DATA_SOURCE_LABELS[source], "offline");
  }

  if (source === "overture") {
    return new SourceAdapterDataSource(new OvertureSourceAdapter(), DATA_SOURCE_LABELS[source], "offline");
  }

  if (source === "city-geojson") {
    return new SourceAdapterDataSource(new CityGeoJsonSourceAdapter(), DATA_SOURCE_LABELS[source], "offline");
  }

  if (source === "local-buildings") {
    return new SourceAdapterDataSource(new LocalBuildingsSourceAdapter(), DATA_SOURCE_LABELS[source], "offline");
  }

  if (source === "wikidata") {
    return new SourceAdapterDataSource(new WikidataSourceAdapter(), DATA_SOURCE_LABELS[source], "online");
  }

  if (source === "copernicus-dem") {
    return new SourceAdapterDataSource(new CopernicusDemSourceAdapter(), DATA_SOURCE_LABELS[source], "online", {
      supportsTiles: true,
      cache: {
        ttlMs: 60 * 60 * 1000,
      },
    });
  }

  return new UnavailableDataSource(source, DATA_SOURCE_LABELS[source]);
}
