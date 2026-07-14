import {
  createDefaultSourceRegistry,
  DataFusionEngine,
  DataSourceEngine,
  DEFAULT_IMPORT_SOURCE_ORDER,
  isImportSourceEnabledByDefault,
  SourceHealthMonitor,
  SourceManager,
} from "@/lib";
import type { DataFusionResult } from "@/lib";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type { ImportSourceId, SourceSyncState } from "@/types/formiq";
import { SpatialImportPipeline } from "./spatial-import/SpatialImportPipeline";
import type { SpatialImportDataset, SpatialImportRequest } from "./spatial-import/types";

export type ImportPipelineStageId =
  | "validate-territory"
  | "resolve-sources"
  | "health-check"
  | "import-buildings"
  | "import-roads"
  | "import-poi"
  | "import-terrain"
  | "data-fusion"
  | "spatial-import"
  | "project-build"
  | "ready";

export type ImportProgressSourceId = ImportSourceId | ImportPipelineStageId;

export interface UnifiedImportResult {
  layers: GISLayer[];
  fusionResult: DataFusionResult;
  spatialImports: SpatialImportDataset[];
}

export interface ImportProgressEvent {
  source: ImportProgressSourceId;
  label: string;
  status: SourceSyncState["status"];
  message: string;
  featureCount: number;
  errorMessage: string | null;
}

export interface UnifiedImportOptions {
  sources?: ImportSourceId[];
  spatialImports?: SpatialImportRequest[];
  onProgress?: (event: ImportProgressEvent) => void;
  onProjectUpdate?: (fusionResult: DataFusionResult) => void | Promise<void>;
}

const stageLabels: Record<ImportPipelineStageId, string> = {
  "validate-territory": "Проверка территории",
  "resolve-sources": "Определение источников",
  "health-check": "Проверка источников",
  "import-buildings": "Импорт зданий",
  "import-roads": "Импорт дорог",
  "import-poi": "Импорт POI",
  "import-terrain": "Импорт рельефа",
  "data-fusion": "Data Fusion",
  "spatial-import": "Spatial Import",
  "project-build": "Создание проекта",
  ready: "Готово",
};

const buildingSources = new Set<ImportSourceId>(["osm", "microsoft-buildings", "overture", "city-geojson", "local-buildings"]);
const roadSources = new Set<ImportSourceId>(["osm", "city-geojson"]);
const poiSources = new Set<ImportSourceId>(["wikidata", "osm", "city-geojson"]);
const terrainSources = new Set<ImportSourceId>(["copernicus-dem"]);

export class ImportPipeline {
  async run(bounds: BoundingBox, options: UnifiedImportOptions = {}): Promise<UnifiedImportResult> {
    this.emitStage(options, "validate-territory", "loading");
    validateImportBounds(bounds);
    this.emitStage(options, "validate-territory", "ready");

    this.emitStage(options, "resolve-sources", "loading");
    const sources = this.resolveSources(options.sources);
    this.emitStage(options, "resolve-sources", "ready", sources.length);

    const registry = createDefaultSourceRegistry(sources);
    const dataSourceEngine = new DataSourceEngine(registry);
    const healthMonitor = new SourceHealthMonitor(dataSourceEngine);

    this.emitStage(options, "health-check", "loading");
    const health = await healthMonitor.checkAll();
    const unavailableCount = health.filter((state) =>
      state.status === "not-configured" ||
      state.status === "offline" ||
      state.status === "rate-limited" ||
      state.status === "error"
    ).length;
    this.emitStage(
      options,
      "health-check",
      unavailableCount > 0 ? "offline" : "ready",
      health.length,
      unavailableCount > 0
        ? `Недоступно источников: ${unavailableCount}. Pipeline продолжит импорт с fallback.`
        : "Все рабочие источники доступны."
    );

    const sourceManager = new SourceManager(dataSourceEngine);
    const fusionEngine = new DataFusionEngine(sourceManager);
    const activeStages = new Set<ImportPipelineStageId>();

    this.emitImportStageStart(options, "import-buildings", sources, buildingSources, activeStages);
    this.emitImportStageStart(options, "import-roads", sources, roadSources, activeStages);
    this.emitImportStageStart(options, "import-poi", sources, poiSources, activeStages);
    this.emitImportStageStart(options, "import-terrain", sources, terrainSources, activeStages);

    const fusionResult = await fusionEngine.fuse(bounds, {
      onSourceComplete: (event) => {
        const source = event.source as ImportSourceId;

        if (buildingSources.has(source)) {
          this.completeStage(options, "import-buildings", activeStages);
        }

        if (roadSources.has(source)) {
          this.completeStage(options, "import-roads", activeStages);
        }

        if (poiSources.has(source)) {
          this.completeStage(options, "import-poi", activeStages);
        }

        if (terrainSources.has(source)) {
          this.completeStage(options, "import-terrain", activeStages);
        }
      },
    });

    this.completeRemainingImportStages(options, activeStages);

    this.emitStage(options, "data-fusion", "loading");
    this.emitStage(options, "data-fusion", "ready", fusionResult.statistics.fusedFeatureCount);

    this.emitStage(options, "spatial-import", "loading");
    const spatialImportResult = await new SpatialImportPipeline().run(options.spatialImports ?? []);
    this.emitStage(options, "spatial-import", "ready", spatialImportResult.layers.length);

    this.emitStage(options, "project-build", "loading");
    await options.onProjectUpdate?.(fusionResult);
    this.emitStage(options, "project-build", "ready", fusionResult.statistics.fusedFeatureCount);

    this.emitStage(options, "ready", "ready", fusionResult.statistics.fusedFeatureCount, "Импорт завершён. Проект готов.");

    return {
      layers: [...fusionResult.layers, ...spatialImportResult.layers],
      fusionResult,
      spatialImports: spatialImportResult.datasets,
    };
  }

  private resolveSources(sources?: ImportSourceId[]): ImportSourceId[] {
    return (sources?.length ? sources : DEFAULT_IMPORT_SOURCE_ORDER).filter(isImportSourceEnabledByDefault);
  }

  private emitImportStageStart(
    options: UnifiedImportOptions,
    stage: ImportPipelineStageId,
    sources: ImportSourceId[],
    stageSources: Set<ImportSourceId>,
    activeStages: Set<ImportPipelineStageId>
  ): void {
    if (!sources.some((source) => stageSources.has(source))) {
      return;
    }

    activeStages.add(stage);
    this.emitStage(options, stage, "loading");
  }

  private completeStage(
    options: UnifiedImportOptions,
    stage: ImportPipelineStageId,
    activeStages: Set<ImportPipelineStageId>
  ): void {
    if (!activeStages.has(stage)) {
      return;
    }

    activeStages.delete(stage);
    this.emitStage(options, stage, "ready");
  }

  private completeRemainingImportStages(
    options: UnifiedImportOptions,
    activeStages: Set<ImportPipelineStageId>
  ): void {
    Array.from(activeStages).forEach((stage) => this.completeStage(options, stage, activeStages));
  }

  private emitStage(
    options: UnifiedImportOptions,
    stage: ImportPipelineStageId,
    status: SourceSyncState["status"],
    featureCount = 0,
    message = getStageMessage(stage, status, featureCount)
  ): void {
    options.onProgress?.({
      source: stage,
      label: stageLabels[stage],
      status,
      message,
      featureCount,
      errorMessage: null,
    });
  }
}

export function getImportStageCount(sources: ImportSourceId[]): number {
  const resolved = (sources.length ? sources : DEFAULT_IMPORT_SOURCE_ORDER).filter(isImportSourceEnabledByDefault);
  const optionalStages = [
    resolved.some((source) => buildingSources.has(source)),
    resolved.some((source) => roadSources.has(source)),
    resolved.some((source) => poiSources.has(source)),
    resolved.some((source) => terrainSources.has(source)),
  ].filter(Boolean).length;

  return 6 + optionalStages;
}

function validateImportBounds(bounds: BoundingBox): void {
  if (
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.north) ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    throw new Error("Выбранная территория некорректна.");
  }
}

function getStageMessage(stage: ImportPipelineStageId, status: SourceSyncState["status"], featureCount: number): string {
  if (status === "loading") return `${stageLabels[stage]}...`;
  if (stage === "resolve-sources") return `Выбрано источников: ${featureCount}`;
  if (stage === "data-fusion") return `Объединено объектов: ${featureCount}`;
  if (stage === "project-build") return "Internal FORMIQ Model, AnalysisResult и тематические карты обновлены.";
  if (stage === "ready") return "Импорт завершён. Проект готов.";
  return `${stageLabels[stage]} завершено.`;
}
