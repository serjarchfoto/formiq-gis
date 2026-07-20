import { createConfiguredExternalProxyRoute } from "@/server/data-proxy/createConfiguredExternalProxyRoute";

export const dynamic = "force-dynamic";
export const GET = createConfiguredExternalProxyRoute({
  sourceId: "stac",
  envVar: "STAC_ENDPOINT",
  allowedParams: ["bbox", "datetime", "collections", "limit", "ids", "query"],
});
