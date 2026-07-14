import { createDataProxyRoute } from "@/server/data-proxy/createDataProxyRoute";

export const dynamic = "force-dynamic";

export const GET = createDataProxyRoute({
  sourceId: "overture",
  envVar: "OVERTURE_DATA_PATH",
  fallbackPath: "data/overture/buildings.geojson",
});
