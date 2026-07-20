import {
  createDefaultSourceRegistry,
  createDataHub,
  createIndexedDbDataHubRepositories,
  createEmptyFormiqProject,
  DataSourceEngine,
  DEFAULT_IMPORT_SOURCE_ORDER,
  DEFAULT_IMPORT_SOURCE_SETTINGS,
  IngestionPipeline,
  isImportSourceSupported,
  NormalizationPipeline,
  CanonicalProjectProjection,
  SourceHealthMonitor,
  SourceManager,
  type DataHubApi,
  type CanonicalProjectProjectionApi,
  type DataFusionResult,
  type IngestionProgressEvent,
  type RefreshTerritoryRequest,
} from "@/lib";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type { FormiqProjectData, ImportSourceId, SourceSyncState } from "@/types/formiq";
import { SpatialImportPipeline } from "./spatial-import/SpatialImportPipeline";
import type { SpatialImportDataset, SpatialImportRequest } from "./spatial-import/types";

export type ImportPipelineStageId =
  | "validate-territory" | "resolve-sources" | "health-check" | "import-buildings"
  | "import-roads" | "import-poi" | "import-terrain" | "data-fusion" | "spatial-import" | "project-build" | "ready";
export type ImportProgressSourceId = ImportSourceId | ImportPipelineStageId;

export interface UnifiedImportResult {
  layers: GISLayer[];
  /** Compatibility shape for callers that still inspect the old result. It is built from the projected canonical model. */
  fusionResult: DataFusionResult;
  spatialImports: SpatialImportDataset[];
  project: FormiqProjectData;
  snapshotId: string;
  qualityStatus: string;
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
  existingProject?: FormiqProjectData;
  onProgress?: (event: ImportProgressEvent) => void;
  onProjectUpdate?: (project: FormiqProjectData) => void | Promise<void>;
}

export interface ImportPipelineDependencies {
  dataHub?: DataHubApi;
  projector?: CanonicalProjectProjectionApi;
}

const stageLabels: Record<ImportPipelineStageId, string> = {
  "validate-territory": "Проверка территории", "resolve-sources": "Определение источников", "health-check": "Проверка источников",
  "import-buildings": "Импорт зданий", "import-roads": "Импорт дорог", "import-poi": "Импорт POI", "import-terrain": "Импорт рельефа",
  "data-fusion": "Data Hub", "spatial-import": "Spatial Import", "project-build": "Создание проекта", ready: "Готово",
};

const buildingSources = new Set<ImportSourceId>(["osm", "microsoft-buildings", "overture", "city-geojson", "local-buildings"]);
const roadSources = new Set<ImportSourceId>(["osm", "city-geojson"]);
const poiSources = new Set<ImportSourceId>(["wikidata", "osm", "city-geojson"]);
const terrainSources = new Set<ImportSourceId>(["copernicus-dem"]);
export const MAX_INTERACTIVE_IMPORT_AREA_SQUARE_KILOMETERS = 50;
export const MAX_INTERACTIVE_IMPORT_FEATURES_PER_SOURCE = 25_000;
export const MAX_INTERACTIVE_IMPORT_FEATURES_TOTAL = 40_000;

export class ImportPipeline {
  constructor(private readonly dependencies: ImportPipelineDependencies = {}) {}

  async run(bounds: BoundingBox, options: UnifiedImportOptions = {}): Promise<UnifiedImportResult> {
    this.emitStage(options, "validate-territory", "loading");
    validateImportBounds(bounds);
    this.emitStage(options, "validate-territory", "ready");

    const selectedSources = resolveSelectedSources(options.sources);
    const availableSources = DEFAULT_IMPORT_SOURCE_ORDER.filter(isImportSourceSupported);
    const excludedSources = availableSources.filter((source) => !selectedSources.includes(source));
    this.emitStage(options, "resolve-sources", "loading");
    this.emitStage(options, "resolve-sources", "ready", selectedSources.length);

    const project = options.existingProject ?? createEmptyFormiqProject();
    const territory = createTerritoryReference(project, bounds);
    const request: RefreshTerritoryRequest = {
      projectId: project.id,
      territory,
      domains: ["building", "road", "green_area", "waterbody", "poi", "transport_stop", ...(selectedSources.includes("copernicus-dem") ? ["terrain" as const] : [])],
      preferredSourceIds: selectedSources,
      excludedSourceIds: excludedSources,
    };
    const dataHub = this.dependencies.dataHub ?? createImportDataHub(availableSources);
    const activeStages = new Set<ImportPipelineStageId>();
    for (const stage of ["import-buildings", "import-roads", "import-poi", "import-terrain"] as ImportPipelineStageId[]) {
      if (request.domains.some((domain) => stageDomain(stage) === domain)) {
        activeStages.add(stage);
        this.emitStage(options, stage, "loading");
      }
    }

    const refresh = await runDataHubRefresh(dataHub, request, options, activeStages);
    if (refresh.ingestionRun.status === "failed") throw new Error("Data Hub refresh failed; the existing project was preserved.");
    this.emitStage(options, "data-fusion", "ready", refresh.snapshot.features.length);

    this.emitStage(options, "spatial-import", "loading");
    const spatialImportResult = await new SpatialImportPipeline().run(options.spatialImports ?? []);
    this.emitStage(options, "spatial-import", "ready", spatialImportResult.layers.length);

    this.emitStage(options, "project-build", "loading");
    const projection = await (this.dependencies.projector ?? new CanonicalProjectProjection()).projectSnapshot({
      existingProject: project,
      canonicalSnapshot: refresh.snapshot,
      quality: refresh.quality,
      territory,
    });
    await options.onProjectUpdate?.(projection);
    const projectedLayers = projection.layerSystem.filter((layer): layer is GISLayer => Boolean(layer.data)) as GISLayer[];
    this.emitStage(options, "project-build", "ready", refresh.snapshot.features.length);
    this.emitStage(options, "ready", "ready", refresh.snapshot.features.length, "Импорт завершён. Проект готов.");

    return {
      layers: [...projectedLayers, ...spatialImportResult.layers],
      fusionResult: createCompatibilityFusionResult(refresh.snapshot.features, projectedLayers, bounds, projection),
      spatialImports: spatialImportResult.datasets,
      project: projection,
      snapshotId: refresh.snapshot.id,
      qualityStatus: refresh.quality.overallStatus,
    };
  }

  private emitStage(options: UnifiedImportOptions, stage: ImportPipelineStageId, status: SourceSyncState["status"], featureCount = 0, message = getStageMessage(stage, status, featureCount)): void {
    options.onProgress?.({ source: stage, label: stageLabels[stage], status, message, featureCount, errorMessage: null });
  }
}

function createImportDataHub(availableSources: ImportSourceId[]): DataHubApi {
  const registry = createDefaultSourceRegistry(availableSources);
  const dataSourceEngine = new DataSourceEngine(registry);
  const sourceHealthMonitor = new SourceHealthMonitor(dataSourceEngine);
  const sourceManager = new SourceManager(dataSourceEngine);
  const repositories = createIndexedDbDataHubRepositories();
  const ingestionPipeline = new IngestionPipeline({
    sourceRegistry: registry,
    dataSourceEngine,
    sourceManager,
    sourceHealthMonitor,
    rawRepository: repositories.rawData,
    ingestionRunRepository: repositories.ingestionRuns,
    normalizationPipeline: new NormalizationPipeline(),
  });
  return createDataHub({ sourceRegistry: registry, dataSourceEngine, sourceHealthMonitor, ingestionPipeline, repositories });
}

async function runDataHubRefresh(dataHub: DataHubApi, request: RefreshTerritoryRequest, options: UnifiedImportOptions, activeStages: Set<ImportPipelineStageId>) {
  return dataHub.refreshTerritory(request, {
    onProgress: (event) => mapHubProgress(options, event, activeStages),
  });
}

function mapHubProgress(options: UnifiedImportOptions, event: IngestionProgressEvent, activeStages: Set<ImportPipelineStageId>): void {
  if (event.stage === "health_check") {
    options.onProgress?.({ source: "health-check", label: stageLabels["health-check"], status: event.completed === event.total ? "ready" : "loading", message: event.message ?? stageLabels["health-check"], featureCount: event.completed, errorMessage: null });
    return;
  }
  if (event.stage === "fetching" || event.stage === "normalizing") {
    const stage = event.domain ? domainStage(event.domain) : null;
    if (!stage || !activeStages.has(stage)) return;
    options.onProgress?.({ source: stage, label: stageLabels[stage], status: event.completed === event.total ? "ready" : "loading", message: event.message ?? stageLabels[stage], featureCount: event.completed, errorMessage: null });
    return;
  }
  if (event.stage === "fusing" || event.stage === "quality") {
    options.onProgress?.({ source: "data-fusion", label: stageLabels["data-fusion"], status: event.completed === event.total ? "ready" : "loading", message: event.message ?? stageLabels["data-fusion"], featureCount: event.completed, errorMessage: null });
  }
}

function createTerritoryReference(project: FormiqProjectData, bounds: BoundingBox) {
  const existing = project.territories.find((territory) => territory.id === project.activeTerritoryId) ?? project.territories.find((territory) => territory.isActive);
  return {
    id: existing?.id ?? `${project.id}:active-territory`, projectId: project.id,
    geometry: existing?.geometry.geometry ?? rectangleGeometry(bounds), bbox: [bounds.west, bounds.south, bounds.east, bounds.north] as [number, number, number, number], crs: project.crs,
  };
}

function rectangleGeometry(bounds: BoundingBox) { return { type: "Polygon" as const, coordinates: [[[bounds.west, bounds.south], [bounds.east, bounds.south], [bounds.east, bounds.north], [bounds.west, bounds.south]]] }; }
function resolveSelectedSources(sources?: ImportSourceId[]): ImportSourceId[] { return (sources?.length ? sources : DEFAULT_IMPORT_SOURCE_ORDER.filter((source) => DEFAULT_IMPORT_SOURCE_SETTINGS[source])).filter(isImportSourceSupported); }
function stageDomain(stage: ImportPipelineStageId) { return stage === "import-buildings" ? "building" : stage === "import-roads" ? "road" : stage === "import-poi" ? "poi" : stage === "import-terrain" ? "terrain" : null; }
function domainStage(domain: string): ImportPipelineStageId | null { return domain === "building" ? "import-buildings" : domain === "road" ? "import-roads" : domain === "poi" || domain === "transport_stop" ? "import-poi" : domain === "terrain" ? "import-terrain" : null; }

function createCompatibilityFusionResult(features: import("@/lib").CanonicalSnapshot["features"], layers: GISLayer[], bounds: BoundingBox, project: FormiqProjectData): DataFusionResult {
  const collections = { buildings: project.buildings, roads: project.roads, vegetation: project.vegetation, water: project.water, terrain: project.terrain, boundaries: project.boundaries, poi: project.poi, transitStops: project.transitStops };
  return { bounds, layers, collections, sourceStates: [], dataSources: project.dataSources, statistics: { inputFeatureCount: features.length, fusedFeatureCount: features.filter((feature) => feature.preferred).length, duplicatesCollapsed: features.filter((feature) => !feature.preferred).length, derivedAttributes: 0 } };
}

export function getImportStageCount(sources: ImportSourceId[]): number {
  const resolved = (sources.length ? sources : DEFAULT_IMPORT_SOURCE_ORDER.filter((source) => DEFAULT_IMPORT_SOURCE_SETTINGS[source])).filter(isImportSourceSupported);
  const optionalStages = [resolved.some((source) => buildingSources.has(source)), resolved.some((source) => roadSources.has(source)), resolved.some((source) => poiSources.has(source)), resolved.some((source) => terrainSources.has(source))].filter(Boolean).length;
  return 6 + optionalStages;
}

function validateImportBounds(bounds: BoundingBox): void {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.west >= bounds.east || bounds.south >= bounds.north) throw new Error("Выбранная территория некорректна.");
  const areaSquareKilometers = getBoundingBoxAreaSquareKilometers(bounds);
  if (areaSquareKilometers > MAX_INTERACTIVE_IMPORT_AREA_SQUARE_KILOMETERS) throw new Error(`Территория слишком большая: ${areaSquareKilometers.toFixed(1)} км².`);
}

export function getBoundingBoxAreaSquareKilometers(bounds: BoundingBox): number {
  const middleLatitudeRadians = (((bounds.south + bounds.north) / 2) * Math.PI) / 180;
  return Math.abs(bounds.east - bounds.west) * 111.32 * Math.cos(middleLatitudeRadians) * Math.abs(bounds.north - bounds.south) * 111.32;
}

function getStageMessage(stage: ImportPipelineStageId, status: SourceSyncState["status"], featureCount: number): string {
  if (status === "loading") return `${stageLabels[stage]}...`;
  if (stage === "resolve-sources") return `Выбрано источников: ${featureCount}`;
  if (stage === "data-fusion") return `Обработано canonical объектов: ${featureCount}`;
  if (stage === "project-build") return "Совместимая модель FORMIQ обновлена.";
  if (stage === "ready") return "Импорт завершён. Проект готов.";
  return `${stageLabels[stage]} завершено.`;
}
