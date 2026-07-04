import {
  DataFusionEngine,
  MicrosoftBuildingSourceAdapter,
  OSMSourceAdapter,
  OvertureSourceAdapter,
  SourceManager,
  WikidataSourceAdapter,
} from "@/lib";
import type { SourceAdapter, SourceAdapterResult } from "@/lib/gis-engine/fusion";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type { ImportSourceId, SourceSyncState } from "@/types/formiq";
import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceEnabledByDefault } from "@/lib";

export interface UnifiedImportResult {
  layers: GISLayer[];
  fusionResult: Awaited<ReturnType<DataFusionEngine["fuse"]>>;
}

export interface ImportProgressEvent {
  source: ImportSourceId;
  label: string;
  status: SourceSyncState["status"];
  message: string;
  featureCount: number;
  errorMessage: string | null;
}

export interface UnifiedImportOptions {
  sources?: ImportSourceId[];
  onProgress?: (event: ImportProgressEvent) => void;
}

const sourceLabels: Record<ImportSourceId, string> = {
  osm: "OpenStreetMap / Overpass",
  "microsoft-buildings": "Microsoft Building Footprints",
  overture: "Overture Maps",
  wikidata: "Wikidata POI",
  gtfs: "GTFS",
  "copernicus-dem": "DEM / Terrain",
  "sentinel-2": "Sentinel",
  "open-weather": "OpenWeather",
};

export function getImportSourceLabel(source: ImportSourceId): string {
  return sourceLabels[source];
}

export async function importOSMLayersByBoundingBox(bounds: BoundingBox): Promise<GISLayer[]> {
  const result = await importUnifiedContextByBoundingBox(bounds, { sources: ["osm"] });
  return result.layers;
}

export async function importUnifiedContextByBoundingBox(
  bounds: BoundingBox,
  options: UnifiedImportOptions = {}
): Promise<UnifiedImportResult> {
  const sources = (options.sources?.length ? options.sources : DEFAULT_IMPORT_SOURCE_ORDER)
    .filter(isImportSourceEnabledByDefault);
  const fusionEngine = createFusionEngine(sources);
  const fusionResult = await fusionEngine.fuse(bounds, {
    onSourceStart: (event) => {
      const source = event.source as ImportSourceId;
      options.onProgress?.({
        source,
        label: getImportSourceLabel(source),
        status: "loading",
        message: `Запрос к ${getImportSourceLabel(source)}...`,
        featureCount: 0,
        errorMessage: null,
      });
    },
    onSourceComplete: (event) => {
      const source = event.source as ImportSourceId;
      const label = getImportSourceLabel(source);
      const isError = event.status === "error";

      options.onProgress?.({
        source,
        label,
        status: event.status,
        message: isError
          ? `Источник ${label} недоступен`
          : `Загружено ${event.featureCount} фич из ${label}`,
        featureCount: event.featureCount,
        errorMessage: event.errorMessage,
      });
    },
  });

  return {
    layers: fusionResult.layers,
    fusionResult,
  };
}

function createFusionEngine(sources: ImportSourceId[]): DataFusionEngine {
  const sourceManager = new SourceManager();

  sources.forEach((source) => {
    sourceManager.register(createSourceAdapter(source));
  });

  return new DataFusionEngine(sourceManager);
}

function createSourceAdapter(source: ImportSourceId): SourceAdapter {
  if (source === "osm") return new OSMSourceAdapter();
  if (source === "microsoft-buildings") return new MicrosoftBuildingSourceAdapter();
  if (source === "overture") return new OvertureSourceAdapter();
  if (source === "wikidata") return new WikidataSourceAdapter();

  return new UnavailableSourceAdapter(source);
}

class UnavailableSourceAdapter implements SourceAdapter {
  readonly version = "not-configured";

  constructor(readonly source: ImportSourceId) {}

  async fetch(): Promise<SourceAdapterResult> {
    throw new Error(`${getImportSourceLabel(this.source)} adapter is not configured yet.`);
  }
}
