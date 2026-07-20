/** Deterministic source fixtures. Normal CI must never require live GIS services. */
export const OVERPASS_FIXTURE = { version: 0.6, elements: [{ type: "way", id: 1, tags: { building: "yes" }, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] }] };
export const WFS_FIXTURE = { type: "FeatureCollection", numberReturned: 1, features: [feature("wfs-1", "Point", [0.5, 0.5], { category: "poi" })] };
export const ARCGIS_REST_FIXTURE = { features: [{ attributes: { OBJECTID: 1, category: "road" }, geometry: { paths: [[[0, 0], [1, 1]]] } }], exceededTransferLimit: false };
export const CKAN_FIXTURE = { result: { results: [{ id: "dataset-1", format: "GeoJSON", url: "https://example.invalid/data.geojson" }] } };
export const STAC_FIXTURE = { type: "FeatureCollection", features: [{ id: "item-1", properties: { datetime: "2026-01-01T00:00:00Z" }, assets: { image: { href: "https://example.invalid/image.tif", type: "image/tiff" } } }] };
export const GEOJSON_FIXTURE = { type: "FeatureCollection", features: [feature("geojson-1", "Point", [0.5, 0.5], { category: "poi" })] };
export const INVALID_GEOMETRY_FIXTURE = { type: "FeatureCollection", features: [feature("invalid-1", "Point", [Number.NaN, 0], {})] };
export const EMPTY_RESULT_FIXTURE = { type: "FeatureCollection", features: [] };
export const RATE_LIMIT_FIXTURE = { status: 429, message: "rate limited" };
export const TIMEOUT_FIXTURE = { status: 408, message: "source timeout" };

function feature(id: string, geometryType: string, coordinates: unknown, properties: Record<string, unknown>) {
  return { type: "Feature", id, properties, geometry: { type: geometryType, coordinates } };
}
