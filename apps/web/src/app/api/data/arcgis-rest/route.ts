import { createConfiguredExternalProxyRoute } from "@/server/data-proxy/createConfiguredExternalProxyRoute";

export const dynamic = "force-dynamic";
export const GET = createConfiguredExternalProxyRoute({
  sourceId: "arcgis-rest",
  envVar: "ARCGIS_REST_ENDPOINT",
  allowedParams: ["f", "where", "outFields", "returnGeometry", "outSR", "inSR", "geometry", "geometryType", "spatialRel", "resultOffset", "resultRecordCount", "resultType", "layerId"],
});
