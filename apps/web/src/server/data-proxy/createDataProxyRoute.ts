import { NextResponse } from "next/server";
import {
  createDataProxyCollection,
  filterFeatureCollectionByBbox,
  parseBboxParam,
  readGeoJsonDatasetPath,
  resolveDatasetPath,
} from "./readGeoJsonDataset";

interface DataProxyRouteConfig {
  sourceId: string;
  envVar: string;
  fallbackPath: string;
}

export function createDataProxyRoute(config: DataProxyRouteConfig) {
  return async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const bbox = parseBboxParam(searchParams.get("bbox"));

    if (!bbox) {
      return NextResponse.json(
        {
          error: "Invalid bbox. Use bbox=minLon,minLat,maxLon,maxLat.",
        },
        { status: 400 }
      );
    }

    const filePath = resolveDatasetPath(process.env[config.envVar], config.fallbackPath);

    try {
      const dataset = await readGeoJsonDatasetPath(filePath);

      if (dataset.files.length === 0) {
        return NextResponse.json(
          createDataProxyCollection(
            config.sourceId,
            bbox,
            filePath,
            [],
            "not-configured",
            "GeoJSON dataset is not configured"
          )
        );
      }

      const filtered = filterFeatureCollectionByBbox(dataset.collection, bbox);
      const status = "ready";

      const response = createDataProxyCollection(
          config.sourceId,
          bbox,
          filePath,
          filtered.features,
          status,
          filtered.features.length === 0 ? "bbox returned 0 features" : undefined
        );

      return NextResponse.json({
        ...response,
        metadata: {
          ...response.metadata,
          datasetFiles: dataset.files.length,
        },
      });
    } catch (error) {
      return NextResponse.json(
        createDataProxyCollection(
          config.sourceId,
          bbox,
          filePath,
          [],
          "error",
          error instanceof Error ? error.message : "dataset read error"
        ),
        { status: 500 }
      );
    }
  };
}
