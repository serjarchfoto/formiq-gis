import { createDataProxyRoute } from "@/server/data-proxy/createDataProxyRoute";

export const dynamic = "force-dynamic";
export const GET = createDataProxyRoute({
  sourceId: "file",
  envVar: "GEOJSON_DATA_PATH",
  fallbackPath: "data/geojson",
});
