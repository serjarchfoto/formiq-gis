import { createConfiguredExternalProxyRoute } from "@/server/data-proxy/createConfiguredExternalProxyRoute";

export const dynamic = "force-dynamic";
export const GET = createConfiguredExternalProxyRoute({
  sourceId: "wfs",
  envVar: "WFS_ENDPOINT",
  allowedParams: ["service", "request", "version", "typeNames", "outputFormat", "bbox", "srsName", "count", "startIndex"],
});
