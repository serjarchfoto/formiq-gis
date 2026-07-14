import { createDataProxyRoute } from "@/server/data-proxy/createDataProxyRoute";

export const dynamic = "force-dynamic";

export const GET = createDataProxyRoute({
  sourceId: "city-geojson",
  envVar: "CITY_GEOJSON_DATA_PATH",
  fallbackPath: "data/city-geojson",
});
