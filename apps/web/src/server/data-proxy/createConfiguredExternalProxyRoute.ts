import { NextResponse } from "next/server";

interface ConfiguredExternalProxyOptions {
  sourceId: string;
  envVar: string;
  allowedParams: string[];
}

/** Server-only allowlisted proxy. It never accepts an arbitrary upstream URL. */
export function createConfiguredExternalProxyRoute(options: ConfiguredExternalProxyOptions) {
  return async function GET(request: Request) {
    const endpoint = process.env[options.envVar];
    if (!endpoint) return NextResponse.json({ type: "FeatureCollection", features: [], metadata: { sourceId: options.sourceId, status: "not-configured" } });
    const incoming = new URL(request.url);
    const upstream = new URL(endpoint);
    for (const key of options.allowedParams) {
      const value = incoming.searchParams.get(key);
      if (value !== null) upstream.searchParams.set(key, value);
    }
    try {
      const response = await fetch(upstream, { headers: { Accept: "application/geo+json, application/json, application/xml, text/xml" } });
      const body = await response.text();
      return new NextResponse(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
    } catch (error) {
      return NextResponse.json({ type: "FeatureCollection", features: [], metadata: { sourceId: options.sourceId, status: "error", message: error instanceof Error ? error.message : "Proxy request failed." } }, { status: 502 });
    }
  };
}
