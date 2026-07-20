import { createConfiguredExternalProxyRoute } from "@/server/data-proxy/createConfiguredExternalProxyRoute";

export const dynamic = "force-dynamic";
export const GET = createConfiguredExternalProxyRoute({
  sourceId: "ckan",
  envVar: "CKAN_ENDPOINT",
  allowedParams: ["q", "rows", "start", "bbox", "fq"],
});
