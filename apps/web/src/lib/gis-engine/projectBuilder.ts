import type { BoundingBox, GISLayer } from "@/types/gis";
import type {
  DataFusionSnapshot,
  FormiqLayerData,
  FormiqProjectData,
  ImportSourceId,
  ProjectDataSource,
  ProjectUnits,
  ProjectOperation,
  SourceSyncState,
} from "@/types/formiq";
import { AnalysisEngine, type AnalysisResult } from "@/lib/gis-engine/analysis";
import type { DataFusionResult } from "@/lib/gis-engine/fusion";
import { ThematicMapEngine } from "@/lib/gis-engine/thematic";

export interface CreateFormiqProjectInput {
  name: string;
  description?: string;
  city?: string;
  author?: string;
  tags?: string[];
  crs?: string;
  units?: ProjectUnits;
}

export const DEFAULT_IMPORT_SOURCE_ORDER: ImportSourceId[] = [
  "osm",
  "microsoft-buildings",
  "overture",
  "city-geojson",
  "local-buildings",
  "wikidata",
  "gtfs",
  "copernicus-dem",
  "sentinel-2",
  "open-weather",
];

export const ENABLED_IMPORT_SOURCE_IDS: ImportSourceId[] = [
  "osm",
  "microsoft-buildings",
  "overture",
  "city-geojson",
  "local-buildings",
  "wikidata",
  "copernicus-dem",
];

const enabledImportSourceSet = new Set<ImportSourceId>(ENABLED_IMPORT_SOURCE_IDS);

export const DEFAULT_IMPORT_SOURCE_SETTINGS: Record<ImportSourceId, boolean> =
  DEFAULT_IMPORT_SOURCE_ORDER.reduce<Record<ImportSourceId, boolean>>((settings, source) => {
    settings[source] = isImportSourceEnabledByDefault(source);
    return settings;
  }, {} as Record<ImportSourceId, boolean>);

export function isImportSourceEnabledByDefault(source: ImportSourceId): boolean {
  return source !== "copernicus-dem" && isImportSourceSupported(source);
}

export function isImportSourceSupported(source: ImportSourceId): boolean {
  return enabledImportSourceSet.has(source);
}

const analysisEngine = new AnalysisEngine();
const thematicMapEngine = new ThematicMapEngine();

export function createEmptyFormiqProject(): FormiqProjectData {
  const now = "1970-01-01T00:00:00.000Z";

  return {
    id: "local-project",
    name: "Проект FORMIQ",
    description: "Архитектурная GIS-среда",
    city: "",
    author: "Architect",
    tags: [],
    isArchived: false,
    isPinned: false,
    isFavorite: false,
    lastOpenedAt: null,
    crs: "WGS84",
    units: "m",
    territories: [],
    activeTerritoryId: null,
    settings: {
      display: {
        workspaceMode: "architecture",
        activeThematicMapType: "none",
        cartographicTheme: "light",
        roadWidthMode: "class-based",
        customRoadWidthMultiplier: 1,
        analysisLayerOpacity: 0.82,
        showRoadCasings: true,
        showLabels: true,
        showPoi: true,
        showScaleBar: true,
        showNorthArrow: true,
        mapCenter: [37.6176, 55.7558],
        mapZoom: 11,
        showContextPanel: true,
      },
      analysis: {
        defaultBufferMeters: 250,
        includeRoadsInBuffer: true,
        includeWaterInBuffer: true,
        includeGreenInBuffer: true,
      },
      export: {
        author: "Architect",
        paperFormat: "A3",
        units: "metric",
      },
      threeD: {
        activeMapType: "white-model",
        visualStyle: "presentation",
        showBuildings: true,
        showRoads: true,
        showZones: true,
        showWater: true,
        showVegetation: true,
        showPoi: true,
        showHeights: true,
        showLegend: true,
        showTerrain: false,
        showTerritoryBoundary: true,
        terrain: {
          enabled: false,
          source: "copernicus-dem",
          mode: "flat",
          exaggeration: 1,
          clipToTerritory: true,
          basePlaneElevation: "zero",
        },
        semanticColoring: true,
        buildingHeightMultiplier: 1,
        zoneOpacity: 0.42,
        routeWidth: 4,
        poiMode: "symbols",
        maxVisiblePoi: 80,
        cameraPreset: "north-west",
        lightingTime: "12:00",
        shadows: true,
        flythroughEnabled: false,
        savedViews: [
          {
            id: "view-north-west",
            name: "Общий вид с юго-запада",
            preset: "north-west",
            thumbnail: "axonometric",
          },
          {
            id: "view-west",
            name: "Вид с запада",
            preset: "west",
            thumbnail: "west",
          },
          {
            id: "view-north",
            name: "Вид с севера",
            preset: "north",
            thumbnail: "north",
          },
          {
            id: "view-top",
            name: "Вид сверху",
            preset: "top",
            thumbnail: "top",
          },
        ],
        screenshots: [],
      },
      debug: {
        enabled: false,
      },
    },
    dataSources: [],
    layers: [],
    layerSystem: [],
    buildings: [],
    roads: [],
    vegetation: [],
    water: [],
    terrain: [],
    boundaries: [],
    poi: [],
    transitStops: [],
    fusion: null,
    importSettings: {
      sources: DEFAULT_IMPORT_SOURCE_SETTINGS,
      includeTerrain: false,
      duplicatePolicy: "prefer-primary",
      splitLargeRequests: true,
    },
    analysisResults: {},
    thematicMaps: {},
    whiteModel: {
      status: "not-created",
      modelIds: [],
      camera: {
        position: [0, -1, 1],
        target: [0, 0, 0],
      },
    },
    semantic3D: {
      status: "not-created",
      sceneIds: [],
      materialProfile: "semantic-default",
    },
    layoutViews: [],
    exportArtifacts: [],
    history: [
      createProjectOperation("project-created", "Проект создан", now),
    ],
    aiContext: {
      summary: "",
      facts: [],
      userPrompts: [],
      generatedInsights: [],
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function createFormiqProject(input: CreateFormiqProjectInput): FormiqProjectData {
  const now = new Date().toISOString();
  const fallback = createEmptyFormiqProject();
  const author = input.author?.trim() || fallback.author;
  const project: FormiqProjectData = {
    ...fallback,
    id: createProjectId(),
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    city: input.city?.trim() ?? "",
    author,
    tags: normalizeProjectTags(input.tags),
    isArchived: false,
    isPinned: false,
    isFavorite: false,
    lastOpenedAt: null,
    crs: input.crs?.trim() || "WGS84",
    units: input.units ?? "m",
    settings: {
      ...fallback.settings,
      export: {
        ...fallback.settings.export,
        author,
        units: "metric",
      },
    },
    history: [createProjectOperation("project-created", "Проект создан", now)],
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };

  return normalizeFormiqProject(project);
}

export function buildFormiqProjectData(
  layers: GISLayer[],
  previousProject = createEmptyFormiqProject(),
  bounds?: BoundingBox
): FormiqProjectData {
  const normalizedProject = normalizeFormiqProject(previousProject);
  const dataLayers = layers
    .map((layer) => layer.data)
    .filter((layerData): layerData is FormiqLayerData => Boolean(layerData));

  return enrichProjectWithAnalysisCache({
    ...normalizedProject,
    dataSources: mergeDataSources(
      normalizedProject.dataSources,
      layers.filter((layer) => layer.data).map((layer) => ({
        id: layer.source.id,
        name: layer.source.name,
        kind: layer.source.format === "osm" ? "osm" : "geojson",
        connectedAt: new Date().toISOString(),
        status: "active",
      }))
    ),
    layers: dataLayers,
    layerSystem: mergeProjectLayerSystem(normalizedProject.layerSystem, layers),
    buildings: dataLayers.flatMap((layer) => layer.buildings),
    roads: dataLayers.flatMap((layer) => layer.roads),
    vegetation: dataLayers.flatMap((layer) => layer.vegetation),
    water: dataLayers.flatMap((layer) => layer.water),
    terrain: dataLayers.flatMap((layer) => layer.terrain),
    boundaries: dataLayers.flatMap((layer) => layer.boundaries ?? []),
    poi: dataLayers.flatMap((layer) => layer.poi ?? []),
    transitStops: dataLayers.flatMap((layer) => layer.transitStops ?? []),
    metadata: {
      ...normalizedProject.metadata,
      updatedAt: new Date().toISOString(),
      bounds: bounds ?? normalizedProject.metadata.bounds,
    },
  });
}

function mergeDataSources(
  existingSources: ProjectDataSource[],
  nextSources: ProjectDataSource[]
): ProjectDataSource[] {
  const sources = new Map(existingSources.map((source) => [source.id, source]));

  nextSources.forEach((source) => {
    sources.set(source.id, {
      ...sources.get(source.id),
      ...source,
    });
  });

  return Array.from(sources.values());
}

export function normalizeFormiqProject(project: Partial<FormiqProjectData>): FormiqProjectData {
  const fallback = createEmptyFormiqProject();
  const now = new Date().toISOString();
  const restoredLayers = getRestoredFormiqLayers(project);

  return {
    ...fallback,
    ...project,
    id: project.id ?? fallback.id,
    name: project.name === "FORMIQ Project" ? fallback.name : project.name ?? fallback.name,
    description:
      project.description === "Architecture workspace project"
        ? fallback.description
        : project.description ?? fallback.description,
    city: project.city ?? fallback.city,
    author: project.author ?? project.settings?.export?.author ?? fallback.author,
    tags: normalizeProjectTags(project.tags),
    isArchived: project.isArchived ?? fallback.isArchived,
    isPinned: project.isPinned ?? fallback.isPinned,
    isFavorite: project.isFavorite ?? fallback.isFavorite,
    lastOpenedAt: project.lastOpenedAt ?? fallback.lastOpenedAt,
    crs: project.crs ?? fallback.crs,
    units: project.units ?? fallback.units,
    territories: (project.territories ?? fallback.territories).map((territory) => ({
      ...territory,
      status: territory.status ?? (territory.isActive ? "ready" : "empty"),
      locked: territory.locked ?? false,
    })),
    activeTerritoryId: project.activeTerritoryId ?? fallback.activeTerritoryId,
    settings: {
      display: {
        ...fallback.settings.display,
        ...project.settings?.display,
      },
      analysis: {
        ...fallback.settings.analysis,
        ...project.settings?.analysis,
      },
      export: {
        ...fallback.settings.export,
        ...project.settings?.export,
      },
      threeD: {
        ...fallback.settings.threeD,
        ...project.settings?.threeD,
        terrain: {
          ...fallback.settings.threeD.terrain,
          ...project.settings?.threeD?.terrain,
        },
      },
      debug: {
        ...fallback.settings.debug,
        ...project.settings?.debug,
      },
    },
    dataSources: project.dataSources ?? fallback.dataSources,
    layers: project.layers?.length ? project.layers : restoredLayers,
    layerSystem: project.layerSystem ?? fallback.layerSystem,
    buildings: project.buildings?.length ? project.buildings : restoredLayers.flatMap((layer) => layer.buildings),
    roads: project.roads?.length ? project.roads : restoredLayers.flatMap((layer) => layer.roads),
    vegetation: project.vegetation?.length
      ? project.vegetation
      : restoredLayers.flatMap((layer) => layer.vegetation),
    water: project.water?.length ? project.water : restoredLayers.flatMap((layer) => layer.water),
    terrain: project.terrain?.length ? project.terrain : restoredLayers.flatMap((layer) => layer.terrain),
    boundaries: project.boundaries?.length
      ? project.boundaries
      : restoredLayers.flatMap((layer) => layer.boundaries ?? []),
    poi: project.poi?.length ? project.poi : restoredLayers.flatMap((layer) => layer.poi ?? []),
    transitStops: project.transitStops?.length
      ? project.transitStops
      : restoredLayers.flatMap((layer) => layer.transitStops ?? []),
    fusion: normalizeFusionSnapshot(project.fusion ?? fallback.fusion),
    importSettings: {
      sources: {
        ...fallback.importSettings.sources,
        ...project.importSettings?.sources,
        "copernicus-dem": project.importSettings?.includeTerrain ?? false,
      },
      includeTerrain: project.importSettings?.includeTerrain ?? false,
      duplicatePolicy: project.importSettings?.duplicatePolicy ?? fallback.importSettings.duplicatePolicy,
      splitLargeRequests:
        project.importSettings?.splitLargeRequests ?? fallback.importSettings.splitLargeRequests,
    },
    analysisResults: project.analysisResults ?? fallback.analysisResults,
    thematicMaps: project.thematicMaps ?? fallback.thematicMaps,
    whiteModel: project.whiteModel ?? fallback.whiteModel,
    semantic3D: project.semantic3D ?? fallback.semantic3D,
    layoutViews: project.layoutViews ?? fallback.layoutViews,
    exportArtifacts: project.exportArtifacts ?? fallback.exportArtifacts,
    history: project.history?.length ? project.history : fallback.history,
    aiContext: project.aiContext ?? fallback.aiContext,
    metadata: {
      ...fallback.metadata,
      ...project.metadata,
      updatedAt: project.metadata?.updatedAt ?? now,
    },
  };
}

function normalizeFusionSnapshot(
  fusion: DataFusionSnapshot | null
): DataFusionSnapshot | null {
  if (!fusion) {
    return null;
  }

  return {
    ...fusion,
    sourceStates: fusion.sourceStates.map(normalizeSourceSyncState),
  };
}

function normalizeSourceSyncState(state: SourceSyncState): SourceSyncState {
  if (
    state.source === "copernicus-dem" &&
    state.status === "error" &&
    isRateLimitMessage(state.errorMessage)
  ) {
    return {
      ...state,
      status: "rate-limited",
      errorMessage: "OpenTopography rate limit reached: API maximum rate limit reached (50 API calls/24hrs).",
    };
  }

  return state;
}

function normalizeProjectTags(tags?: string[]): string[] {
  if (!tags?.length) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function isRateLimitMessage(message: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("maximum rate") ||
    normalized.includes("50 api calls")
  );
}

export function createProjectOperation(
  type: ProjectOperation["type"],
  label: string,
  createdAt = new Date().toISOString(),
  payload?: ProjectOperation["payload"]
): ProjectOperation {
  return {
    id: createProjectId(),
    type,
    label,
    createdAt,
    payload,
  };
}

/** @deprecated New imports project CanonicalSnapshot through CanonicalProjectProjection. */
export function buildFormiqProjectFromFusionResult(
  fusionResult: DataFusionResult,
  previousProject = createEmptyFormiqProject()
): FormiqProjectData {
  const normalizedProject = normalizeFormiqProject(previousProject);
  const now = new Date().toISOString();
  const fusionSnapshot: DataFusionSnapshot = {
    fusedAt: now,
    bounds: fusionResult.bounds,
    cacheKey: `${normalizedProject.id}:${fusionResult.bounds.west}:${fusionResult.bounds.south}:${fusionResult.bounds.east}:${fusionResult.bounds.north}`,
    collections: fusionResult.collections,
    sourceStates: fusionResult.sourceStates,
    statistics: fusionResult.statistics,
  };
  const layerData = fusionResult.layers
    .map((layer) => layer.data)
    .filter((layerData): layerData is FormiqLayerData => Boolean(layerData));
  // Some chunked/legacy providers return renderable layer data while their
  // canonical collection is empty. Recover the canonical arrays here so the
  // analysis workspace sees the same imported objects as the map.
  const collections = {
    buildings: fusionResult.collections.buildings.length ? fusionResult.collections.buildings : layerData.flatMap((layer) => layer.buildings),
    roads: fusionResult.collections.roads.length ? fusionResult.collections.roads : layerData.flatMap((layer) => layer.roads),
    vegetation: fusionResult.collections.vegetation.length ? fusionResult.collections.vegetation : layerData.flatMap((layer) => layer.vegetation),
    water: fusionResult.collections.water.length ? fusionResult.collections.water : layerData.flatMap((layer) => layer.water),
    terrain: fusionResult.collections.terrain.length ? fusionResult.collections.terrain : layerData.flatMap((layer) => layer.terrain),
    boundaries: fusionResult.collections.boundaries.length ? fusionResult.collections.boundaries : layerData.flatMap((layer) => layer.boundaries ?? []),
    poi: fusionResult.collections.poi.length ? fusionResult.collections.poi : layerData.flatMap((layer) => layer.poi ?? []),
    transitStops: fusionResult.collections.transitStops.length ? fusionResult.collections.transitStops : layerData.flatMap((layer) => layer.transitStops ?? []),
  };

  return enrichProjectWithAnalysisCache({
    ...normalizedProject,
    layers: layerData,
    layerSystem: mergeProjectLayerSystem(normalizedProject.layerSystem, fusionResult.layers),
    buildings: collections.buildings,
    roads: collections.roads,
    vegetation: collections.vegetation,
    water: collections.water,
    terrain: collections.terrain,
    boundaries: collections.boundaries,
    poi: collections.poi,
    transitStops: collections.transitStops,
    dataSources: fusionResult.dataSources,
    fusion: fusionSnapshot,
    metadata: {
      ...normalizedProject.metadata,
      bounds: fusionResult.bounds,
      updatedAt: now,
    },
  });
}

export function enrichProjectWithAnalysisCache(project: FormiqProjectData): FormiqProjectData {
  const normalizedProject = normalizeFormiqProject(project);
  const analysisResult = analysisEngine.analyze(normalizedProject);
  const thematicMaps = thematicMapEngine.generateAll(normalizedProject, analysisResult);
  const analyzedAt = new Date().toISOString();

  return {
    ...normalizedProject,
    analysisResults: {
      ...normalizedProject.analysisResults,
      current: analysisResult,
      currentUpdatedAt: analyzedAt,
    },
    thematicMaps: {
      ...thematicMaps,
    },
  };
}

export function getCachedAnalysisResult(project: FormiqProjectData): AnalysisResult | null {
  return isAnalysisResult(project.analysisResults.current)
    ? project.analysisResults.current
    : null;
}

export function getCachedAnalysisTimestamp(project: FormiqProjectData): string | null {
  return typeof project.analysisResults.currentUpdatedAt === "string"
    ? project.analysisResults.currentUpdatedAt
    : null;
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "territory" in value &&
      "buildings" in value &&
      "roads" in value
  );
}

function normalizeProjectLayer(layer: GISLayer): FormiqProjectData["layerSystem"][number] {
  return {
    ...layer,
    opacity: layer.opacity ?? layer.style.opacity ?? 1,
    sourceType: layer.sourceType ?? (layer.source.format === "osm" ? "fusion" : layer.source.format),
    removable: layer.removable ?? false,
    order: layer.order ?? 0,
  };
}

function getRestoredFormiqLayers(project: Partial<FormiqProjectData>): FormiqLayerData[] {
  if (project.layers?.length) {
    return project.layers;
  }

  return (project.layerSystem ?? [])
    .map((layer) => layer.data)
    .filter((data): data is FormiqLayerData => Boolean(data && isFormiqLayerData(data)));
}

function isFormiqLayerData(data: unknown): data is FormiqLayerData {
  return Boolean(
    data &&
      typeof data === "object" &&
      "category" in data &&
      "metadata" in data &&
      "buildings" in data &&
      "roads" in data
  );
}

function mergeProjectLayerSystem(
  existingLayers: FormiqProjectData["layerSystem"],
  incomingLayers: GISLayer[]
): FormiqProjectData["layerSystem"] {
  const incomingIds = new Set(incomingLayers.map((layer) => layer.id));
  const normalizedIncoming = incomingLayers.map(normalizeProjectLayer);
  const preservedLayers = existingLayers.filter((layer) => !incomingIds.has(layer.id));

  return [...normalizedIncoming, ...preservedLayers]
    .sort((left, right) => left.order - right.order)
    .map((layer, index) => ({
      ...layer,
      order: index,
    }));
}

function createProjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `formiq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
