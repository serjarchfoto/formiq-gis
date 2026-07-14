import { createDataProxyRoute } from "@/server/data-proxy/createDataProxyRoute";

export const dynamic = "force-dynamic";

export const GET = createDataProxyRoute({
  sourceId: "local-buildings",
  envVar: "LOCAL_BUILDINGS_DATA_PATH",
  fallbackPath: "data/local-buildings/buildings.geojson",
});
