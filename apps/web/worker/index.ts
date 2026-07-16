interface Env {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

async function fetchStaticAsset(request: Request, assets: Env["ASSETS"]): Promise<Response | null> {
  const url = new URL(request.url);
  const candidates = [
    url.pathname === "/" ? "/index.html" : url.pathname,
    url.pathname.endsWith("/") ? `${url.pathname}index.html` : `${url.pathname}.html`,
  ];

  for (const pathname of [...new Set(candidates)]) {
    const assetUrl = new URL(pathname, request.url);
    const response = await assets.fetch(new Request(assetUrl, request));
    if (response.status !== 404) return response;
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (env?.ASSETS && !url.pathname.startsWith("/api/") && url.pathname !== "/_vinext/image") {
      const staticResponse = await fetchStaticAsset(request, env.ASSETS);
      if (staticResponse) return staticResponse;
    }

    const [{ DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES, handleImageOptimization }, { default: handler }] =
      await Promise.all([
        import("vinext/server/image-optimization"),
        import("vinext/server/app-router-entry"),
      ]);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};
