import {
  parseBboxParam,
  readMicrosoftBuildingsDataset,
  resolveMicrosoftDatasetIndexPath,
} from "@/server/data-proxy/microsoftBuildingsDataset";
import {
  createDataProxyCollection,
  filterFeatureCollectionByBbox,
  readGeoJsonDatasetPath,
  resolveDatasetPath,
} from "@/server/data-proxy/readGeoJsonDataset";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = parseBboxParam(searchParams.get("bbox"));

  if (!bbox) {
    return Response.json(
      {
        error: "Invalid bbox. Use bbox=minLon,minLat,maxLon,maxLat.",
      },
      { status: 400 }
    );
  }

  const filePath = resolveDatasetPath(process.env.MICROSOFT_BUILDINGS_DATA_PATH, "data/microsoft-buildings/buildings.geojson");
  const dataset = await readGeoJsonDatasetPath(filePath);

  if (dataset.files.length > 0) {
    const filtered = filterFeatureCollectionByBbox(dataset.collection, bbox);
    const status = "ready";
    const response = createDataProxyCollection(
      "microsoft-buildings",
      bbox,
      filePath,
      filtered.features,
      status,
      filtered.features.length === 0 ? "bbox returned 0 features" : undefined
    );

    return Response.json({
      ...response,
      metadata: {
        ...response.metadata,
        datasetFiles: dataset.files.length,
        datasetMode: "geojson",
      },
    });
  }

  const indexPath = resolveMicrosoftDatasetIndexPath(process.env.MICROSOFT_BUILDINGS_INDEX_PATH);

  try {
    return Response.json(
      await readMicrosoftBuildingsDataset({
        sourceId: "microsoft-buildings",
        bbox,
        indexPath,
      })
    );
  } catch (error) {
    return Response.json(
      createDataProxyCollection(
        "microsoft-buildings",
        bbox,
        indexPath,
        [],
        "error",
        error instanceof Error ? error.message : "Microsoft buildings dataset read error"
      ),
      { status: 500 }
    );
  }
}
