import type { CanonicalDomain } from "../types";
import type { SourcePolicyTemplate } from "./types";

/** Domain templates are hints, not static source ordering or hard dependencies. */
export const DEFAULT_SOURCE_POLICY_TEMPLATES: Record<CanonicalDomain, SourcePolicyTemplate> = {
  building: { domain: "building", preferredSourceIds: ["microsoft-buildings", "overture", "wfs", "arcgis-rest"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  road: { domain: "road", preferredSourceIds: ["wfs", "arcgis-rest", "city-geojson"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  green_area: { domain: "green_area", preferredSourceIds: ["wfs", "land-cover", "sentinel-2"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  waterbody: { domain: "waterbody", preferredSourceIds: ["wfs", "hydrography", "arcgis-rest"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  poi: { domain: "poi", preferredSourceIds: ["overture", "wikidata", "arcgis-rest"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  transport_stop: { domain: "transport_stop", preferredSourceIds: ["gtfs", "wfs", "arcgis-rest"], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 },
  boundary: { domain: "boundary", preferredSourceIds: ["wfs", "arcgis-rest", "city-geojson"], minimumSources: 1, maximumSources: 2, selectionThreshold: 0.62 },
  parcel: { domain: "parcel", preferredSourceIds: ["wfs", "arcgis-rest", "cadastre"], minimumSources: 1, maximumSources: 2, selectionThreshold: 0.62 },
  terrain: { domain: "terrain", preferredSourceIds: ["copernicus-dem", "open-topography", "wfs"], minimumSources: 1, maximumSources: 2, selectionThreshold: 0.62 },
  imagery: { domain: "imagery", preferredSourceIds: ["sentinel-2", "raster", "stac"], minimumSources: 1, maximumSources: 2, selectionThreshold: 0.62 },
};
