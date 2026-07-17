import type { Geometry, Position } from "geojson";
import { DEFAULT_OSM_LAYER_STYLES } from "@/constants/gis";
import { SemanticEngine } from "@/lib/gis-engine/semantic";
import { calculateLineLength, calculatePolygonArea } from "@/utils";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type {
  AttributeProvenance,
  DataConfidence,
  DataSourceKind,
  FeatureProvenance,
  FormiqBoundary,
  FormiqBuilding,
  FormiqLayerData,
  FormiqPoi,
  FormiqRoad,
  FormiqTerrain,
  FormiqTransitStop,
  FormiqVegetation,
  FormiqWater,
  ProjectDataSource,
} from "@/types/formiq";
import { FusionPriorityRegistry } from "./FusionPriorityRegistry";
import { SourceManager } from "./SourceManager";
import type { SourceLoadOptions } from "./SourceManager";
import type {
  DataFusionResult,
  SourceAdapterResult,
  SourceBuildingFeature,
  SourceFeature,
  SourcePoiFeature,
  SourceRoadFeature,
  SourceTerrainFeature,
  SourceTransitStopFeature,
  SourceVegetationFeature,
  SourceWaterFeature,
} from "./types";
import {
  createUnknownBuildingSemantic,
  createUnknownRoadSemantic,
  createUnknownTerrainSemantic,
  createUnknownVegetationSemantic,
  createUnknownWaterSemantic,
  toLineGeometry,
  toPointGeometry,
  toPolygonGeometry,
} from "./providers/sourceAdapterUtils";

const DEFAULT_FLOOR_HEIGHT_METERS = 3.2;

export class DataFusionEngine {
  private readonly fusionCache = new Map<string, DataFusionResult>();

  constructor(
    private readonly sourceManager: SourceManager | null = null,
    private readonly priorityRegistry = new FusionPriorityRegistry(),
    private readonly semanticEngine = new SemanticEngine()
  ) {}

  async fuse(bounds: BoundingBox, options: SourceLoadOptions = {}): Promise<DataFusionResult> {
    const cacheKey = this.createCacheKey(bounds);
    const cached = this.fusionCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    if (!this.sourceManager) {
      throw new Error("DataFusionEngine.fuse requires a SourceManager.");
    }

    const sourceResults = await this.sourceManager.loadAll(bounds, options);
    const result = this.fuseSourceResults(bounds, sourceResults);
    this.fusionCache.set(cacheKey, result);
    return result;
  }

  /**
   * Builds the canonical FORMIQ model from already normalized source features.
   * Chunked imports use this same path after their worker has normalized data,
   * keeping map-only chunks and the project model on one contract.
   */
  fuseSourceResults(
    bounds: BoundingBox,
    sourceResults: SourceAdapterResult[],
    sourceStates = this.sourceManager?.getStates() ?? [],
    dataSources = sourceStates.map(toProjectDataSource)
  ): DataFusionResult {
    const inputFeatureCount = sourceResults.reduce((total, result) => total + result.features.length, 0);
    const buildings = this.mergeBuildings(sourceResults);
    const roads = this.mergeRoads(sourceResults);
    const vegetation = this.mergeVegetation(sourceResults);
    const water = this.mergeWater(sourceResults);
    const terrain = this.mergeTerrain(sourceResults);
    const boundaries = this.mergeBoundaries(sourceResults);
    const poi = this.mergePoi(sourceResults);
    const transitStops = this.mergeTransitStops(sourceResults);
    const semanticCollections = this.applySemantics({
      buildings,
      roads,
      vegetation,
      water,
      terrain,
    });
    const layers = createLayersFromCollections(
      {
        ...semanticCollections,
        boundaries,
        poi,
        transitStops,
      },
      bounds
    );
    const fusedFeatureCount =
      semanticCollections.buildings.length +
      semanticCollections.roads.length +
      semanticCollections.vegetation.length +
      semanticCollections.water.length +
      semanticCollections.terrain.length +
      boundaries.length +
      poi.length +
      transitStops.length;
    const result: DataFusionResult = {
      bounds,
      layers,
      collections: {
        ...semanticCollections,
        boundaries,
        poi,
        transitStops,
      },
      sourceStates,
      dataSources,
      statistics: {
        inputFeatureCount,
        fusedFeatureCount,
        duplicatesCollapsed: Math.max(inputFeatureCount - fusedFeatureCount, 0),
        derivedAttributes: semanticCollections.buildings.reduce(
          (count, building) =>
            count +
            (building.heightFromLevels !== null ? 1 : 0) +
            (building.volume !== null ? 1 : 0) +
            (building.relativeHeight !== null && building.relativeHeight === building.heightFromLevels ? 1 : 0),
          0
        ),
      },
    };

    return result;
  }

  invalidate(bounds?: BoundingBox): void {
    if (!bounds) {
      this.fusionCache.clear();
      this.sourceManager?.invalidate();
      return;
    }

    this.fusionCache.delete(this.createCacheKey(bounds));
  }

  private mergeBuildings(results: SourceAdapterResult[]): FormiqBuilding[] {
    const candidates = results.flatMap((result) =>
      result.features.filter((feature): feature is SourceBuildingFeature => feature.kind === "building")
    );
    const groups: SourceBuildingFeature[][] = [];

    candidates.forEach((candidate) => {
      const existingGroup = groups.find((group) => areBuildingsRelated(group[0], candidate));

      if (existingGroup) {
        existingGroup.push(candidate);
        return;
      }

      groups.push([candidate]);
    });

    return groups
      .map((group, index) => this.mergeBuildingGroup(group, index))
      .filter((building): building is FormiqBuilding => Boolean(building));
  }

  private mergeBuildingGroup(group: SourceBuildingFeature[], index: number): FormiqBuilding | null {
    const geometryPriority = this.priorityRegistry.getPriorities("buildingGeometry");
    const functionPriority = this.priorityRegistry.getPriorities("buildingFunction");
    const addressPriority = this.priorityRegistry.getPriorities("buildingAddress");
    const geometryCandidate = pickBySourcePriority(group, geometryPriority);
    const geometry = geometryCandidate ? toPolygonGeometry(geometryCandidate.geometry) : null;

    if (!geometryCandidate || !geometry) {
      return null;
    }

    const area = calculatePolygonArea(geometry);
    const levels = pickAttribute(group, "levels", functionPriority);
    const explicitHeight = pickAttribute(group, "height", geometryPriority);
    const year = pickAttribute(group, "year", functionPriority);
    const usage = normalizeBuildingUsage(pickAttribute(group, "usage", functionPriority));
    const material = pickAttribute(group, "material", functionPriority);
    const roof = pickAttribute(group, "roof", functionPriority);
    const objectType = pickAttribute(group, "objectType", functionPriority);
    const addressLabel = pickAttribute(group, "addressLabel", addressPriority);
    const heightFromLevels = typeof levels === "number" ? Number((levels * DEFAULT_FLOOR_HEIGHT_METERS).toFixed(2)) : null;
    const relativeHeight =
      typeof explicitHeight === "number" ? explicitHeight : heightFromLevels;
    const volume =
      relativeHeight !== null ? Number((area * relativeHeight).toFixed(2)) : null;
    const source = geometryCandidate.source;
    const tags = mergeTags(group);
    const names = mergeNames(group);

    return {
      id: `building-${index}-${geometryCandidate.sourceFeatureId}`,
      type: "building",
      geometry,
      height: explicitHeight ?? null,
      absoluteHeight: null,
      relativeHeight,
      heightFromLevels,
      levels: typeof levels === "number" ? levels : null,
      baseElevation: null,
      area,
      volume,
      year: typeof year === "number" ? year : null,
      usage,
      material: typeof material === "string" ? material : null,
      roof: typeof roof === "string" ? roof : null,
      objectType: typeof objectType === "string" ? objectType : null,
      addressLabel: typeof addressLabel === "string" ? addressLabel : null,
      semantic: createUnknownBuildingSemantic(),
      tags,
      names,
      source,
      confidence: getSourceConfidence(source),
      lifecycleState: "active",
      provenance: buildFeatureProvenance(group, source, {
        height: buildAttributeProvenance(group, "height"),
        levels: buildAttributeProvenance(group, "levels"),
        year: buildAttributeProvenance(group, "year"),
        usage: buildAttributeProvenance(group, "usage"),
        addressLabel: buildAttributeProvenance(group, "addressLabel"),
        heightFromLevels:
          heightFromLevels !== null
            ? [createDerivedProvenance(source, geometryCandidate.sourceFeatureId, "Derived from levels.")]
            : [],
        volume:
          volume !== null && relativeHeight !== null
            ? [createDerivedProvenance(source, geometryCandidate.sourceFeatureId, "Area multiplied by relative height.")]
            : [],
      }),
      threeD: {
        absoluteHeight: null,
        relativeHeight,
        heightFromLevels,
        baseElevation: null,
        volume,
        whiteModel: {
          extrusionHeight: relativeHeight,
          extrusionMode:
            explicitHeight !== null
              ? "absolute-height"
              : heightFromLevels !== null
                ? "levels-derived"
                : "unknown",
          baseElevation: null,
          materialProfile: "white-model-default",
          colorSchemeId: "building-neutral",
        },
        semantic3D: {
          semanticColorGroup: "unknown",
          materialId: "semantic-building-default",
          renderPriority: 10,
        },
      },
    };
  }

  private mergeRoads(results: SourceAdapterResult[]): FormiqRoad[] {
    const roads = results
      .flatMap((result) =>
        result.features.filter((feature): feature is SourceRoadFeature => feature.kind === "road")
      )
      .map((candidate, index) => {
        const geometry = toLineGeometry(candidate.geometry);

        if (!geometry) {
          return null;
        }

        return {
          id: `road-${index}-${candidate.sourceFeatureId}`,
          type: "road" as const,
          geometry,
          length: calculateLineLength(geometry),
          roadType: normalizeRoadType(candidate.roadType),
          surface: candidate.surface ?? null,
          name: candidate.name ?? candidate.names?.default ?? null,
          lanes: candidate.lanes ?? null,
          semantic: createUnknownRoadSemantic(),
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {
            roadType: buildAttributeProvenance([candidate], "roadType"),
          }),
        };
      })
      .filter(isPresent);

    return roads;
  }

  private mergeVegetation(results: SourceAdapterResult[]): FormiqVegetation[] {
    const vegetation = results
      .flatMap((result) =>
        result.features.filter((feature): feature is SourceVegetationFeature => feature.kind === "vegetation")
      )
      .map((candidate, index) => {
        const geometry = toPolygonGeometry(candidate.geometry);

        if (!geometry) {
          return null;
        }

        return {
          id: `green-${index}-${candidate.sourceFeatureId}`,
          type: "vegetation" as const,
          geometry,
          area: calculatePolygonArea(geometry),
          vegetationType: candidate.vegetationType ?? null,
          semantic: createUnknownVegetationSemantic(),
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {
            vegetationType: buildAttributeProvenance([candidate], "vegetationType"),
          }),
        };
      })
      .filter(isPresent);

    return vegetation;
  }

  private mergeWater(results: SourceAdapterResult[]): FormiqWater[] {
    const water = results
      .flatMap((result) =>
        result.features.filter((feature): feature is SourceWaterFeature => feature.kind === "water")
      )
      .map((candidate, index) => {
        const geometry = toPolygonGeometry(candidate.geometry);

        if (!geometry) {
          return null;
        }

        return {
          id: `water-${index}-${candidate.sourceFeatureId}`,
          type: "water" as const,
          geometry,
          area: calculatePolygonArea(geometry),
          waterType: candidate.waterType ?? null,
          semantic: createUnknownWaterSemantic(),
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {
            waterType: buildAttributeProvenance([candidate], "waterType"),
          }),
        };
      })
      .filter(isPresent);

    return water;
  }

  private mergeTerrain(results: SourceAdapterResult[]): FormiqTerrain[] {
    const terrain = results
      .flatMap((result) =>
        result.features.filter((feature): feature is SourceTerrainFeature => feature.kind === "terrain")
      )
      .map((candidate, index) => {
        const geometry = toPointGeometry(candidate.geometry);

        if (!geometry) {
          return null;
        }

        return {
          id: `terrain-${index}-${candidate.sourceFeatureId}`,
          type: "terrain" as const,
          geometry,
          elevation: typeof candidate.elevation === "number" ? candidate.elevation : null,
          slope: typeof candidate.slope === "number" ? candidate.slope : null,
          semantic: createUnknownTerrainSemantic(),
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {
            elevation: buildAttributeProvenance([candidate], "elevation"),
            slope: buildAttributeProvenance([candidate], "slope"),
          }),
        };
      })
      .filter(isPresent);

    const elevations = terrain
      .map((item) => item.elevation)
      .filter((value): value is number => typeof value === "number");

    if (elevations.length === 0) {
      return terrain;
    }

    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    const span = Math.max(max - min, 1);
    const lowThreshold = min + span / 3;
    const highThreshold = min + (span * 2) / 3;

    return terrain.map((item) => {
      if (typeof item.elevation !== "number") {
        return item;
      }

      return {
        ...item,
        semantic: {
          ...item.semantic,
          elevationCategory:
            item.elevation <= lowThreshold
              ? "low"
              : item.elevation <= highThreshold
                ? "medium"
                : "high",
        },
      };
    });
  }

  private mergeBoundaries(results: SourceAdapterResult[]): FormiqBoundary[] {
    const boundaries = results
      .flatMap((result) => result.features.filter((feature) => feature.kind === "boundary"))
      .map((candidate, index) => {
        const geometry = toPolygonGeometry(candidate.geometry);

        if (!geometry || candidate.kind !== "boundary") {
          return null;
        }

        return {
          id: `boundary-${index}-${candidate.sourceFeatureId}`,
          type: "boundary" as const,
          geometry,
          adminLevel: candidate.adminLevel ?? null,
          name: candidate.name ?? null,
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {}),
        };
      })
      .filter(isPresent);

    return boundaries;
  }

  private mergePoi(results: SourceAdapterResult[]): FormiqPoi[] {
    const candidates = results.flatMap((result) =>
      result.features.filter((feature): feature is SourcePoiFeature => feature.kind === "poi")
    );

    const poi = candidates
      .map((candidate, index) => {
        const pointGeometry = toPointGeometry(candidate.geometry);
        const polygonGeometry = toPolygonGeometry(candidate.geometry);

        if (!pointGeometry && !polygonGeometry) {
          return null;
        }

        return {
          id: `poi-${index}-${candidate.sourceFeatureId}`,
          type: "poi" as const,
          geometry: pointGeometry ?? polygonGeometry!,
          category: candidate.category ?? "poi",
          subtype: candidate.subtype ?? null,
          name: candidate.name ?? candidate.names?.default ?? null,
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {}),
        };
      })
      .filter(isPresent);

    return poi;
  }

  private mergeTransitStops(results: SourceAdapterResult[]): FormiqTransitStop[] {
    return results
      .flatMap((result) =>
        result.features.filter(
          (feature): feature is SourceTransitStopFeature => feature.kind === "transit-stop"
        )
      )
      .map((candidate, index) => {
        const geometry = toPointGeometry(candidate.geometry);
        if (!geometry) return null;
        return {
          id: `transit-stop-${index}-${candidate.sourceFeatureId}`,
          type: "transit-stop" as const,
          geometry,
          network: candidate.network ?? candidate.tags.network ?? candidate.tags.operator ?? null,
          stopType: candidate.stopType ?? candidate.tags.public_transport ?? candidate.tags.highway ?? null,
          name: candidate.name ?? candidate.names?.default ?? candidate.tags.name ?? null,
          tags: candidate.tags,
          names: candidate.names,
          source: candidate.source,
          confidence: getSourceConfidence(candidate.source),
          lifecycleState: "active" as const,
          provenance: buildFeatureProvenance([candidate], candidate.source, {}),
        };
      })
      .filter(isPresent);
  }

  private applySemantics(collections: {
    buildings: FormiqBuilding[];
    roads: FormiqRoad[];
    vegetation: FormiqVegetation[];
    water: FormiqWater[];
    terrain: FormiqTerrain[];
  }) {
    const buildingsLayer = this.semanticEngine.analyzeLayer({
      category: "buildings",
      buildings: collections.buildings,
      roads: [],
      vegetation: [],
      water: [],
      terrain: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        featureCount: collections.buildings.length,
      },
    });
    const roadsLayer = this.semanticEngine.analyzeLayer({
      category: "roads",
      buildings: [],
      roads: collections.roads,
      vegetation: [],
      water: [],
      terrain: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        featureCount: collections.roads.length,
      },
    });
    const vegetationLayer = this.semanticEngine.analyzeLayer({
      category: "green",
      buildings: [],
      roads: [],
      vegetation: collections.vegetation,
      water: [],
      terrain: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        featureCount: collections.vegetation.length,
      },
    });
    const waterLayer = this.semanticEngine.analyzeLayer({
      category: "water",
      buildings: [],
      roads: [],
      vegetation: [],
      water: collections.water,
      terrain: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        featureCount: collections.water.length,
      },
    });

    return {
      buildings: buildingsLayer.buildings,
      roads: roadsLayer.roads,
      vegetation: vegetationLayer.vegetation,
      water: waterLayer.water,
      terrain: collections.terrain,
    };
  }

  private createCacheKey(bounds: BoundingBox): string {
    return `fusion:${bounds.west}:${bounds.south}:${bounds.east}:${bounds.north}`;
  }
}

function createLayersFromCollections(
  collections: {
    buildings: FormiqBuilding[];
    roads: FormiqRoad[];
    vegetation: FormiqVegetation[];
    water: FormiqWater[];
    terrain: FormiqTerrain[];
    boundaries?: FormiqBoundary[];
    poi?: FormiqPoi[];
    transitStops?: FormiqTransitStop[];
  },
  bounds: BoundingBox
): GISLayer[] {
  return [
    createLayer("buildings", "Здания", "polygon", DEFAULT_OSM_LAYER_STYLES.buildings, {
      category: "buildings",
      buildings: collections.buildings,
      roads: [],
      vegetation: [],
      water: [],
      terrain: [],
      boundaries: [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.buildings.length,
      },
    }),
    createLayer("roads", "Дороги", "line", DEFAULT_OSM_LAYER_STYLES.roads, {
      category: "roads",
      buildings: [],
      roads: collections.roads,
      vegetation: [],
      water: [],
      terrain: [],
      boundaries: [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.roads.length,
      },
    }),
    createLayer("green", "Озеленение", "polygon", DEFAULT_OSM_LAYER_STYLES.green, {
      category: "green",
      buildings: [],
      roads: [],
      vegetation: collections.vegetation,
      water: [],
      terrain: [],
      boundaries: [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.vegetation.length,
      },
    }),
    createLayer("water", "Вода", "polygon", DEFAULT_OSM_LAYER_STYLES.water, {
      category: "water",
      buildings: [],
      roads: [],
      vegetation: [],
      water: collections.water,
      terrain: [],
      boundaries: [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.water.length,
      },
    }),
    createLayer("terrain", "Рельеф", "point", DEFAULT_OSM_LAYER_STYLES.terrain, {
      category: "terrain",
      buildings: [],
      roads: [],
      vegetation: [],
      water: [],
      terrain: collections.terrain,
      boundaries: [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.terrain.length,
      },
    }),
    createLayer("boundaries", "Границы", "polygon", DEFAULT_OSM_LAYER_STYLES.boundaries, {
      category: "boundaries",
      buildings: [],
      roads: [],
      vegetation: [],
      water: [],
      terrain: [],
      boundaries: collections.boundaries ?? [],
      poi: [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.boundaries?.length ?? 0,
      },
    }),
    createLayer("poi", "POI", "point", DEFAULT_OSM_LAYER_STYLES.poi, {
      category: "poi",
      buildings: [],
      roads: [],
      vegetation: [],
      water: [],
      terrain: [],
      boundaries: [],
      poi: collections.poi ?? [],
      transitStops: [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.poi?.length ?? 0,
      },
    }),
    createLayer("transit", "Остановки", "point", DEFAULT_OSM_LAYER_STYLES.transit, {
      category: "transit",
      buildings: [],
      roads: [],
      vegetation: [],
      water: [],
      terrain: [],
      boundaries: [],
      poi: [],
      transitStops: collections.transitStops ?? [],
      metadata: {
        source: "Data Fusion Engine",
        importedAt: new Date().toISOString(),
        bounds,
        featureCount: collections.transitStops?.length ?? 0,
      },
    }),
  ];
}

function createLayer(
  id: "buildings" | "roads" | "green" | "water" | "terrain" | "boundaries" | "poi" | "transit",
  name: string,
  geometryType: GISLayer["geometryType"],
  style: GISLayer["style"],
  data: FormiqLayerData
): GISLayer {
  return {
    id,
    name,
    visible: true,
    opacity: style.opacity ?? 1,
    sourceType: "fusion",
    removable: false,
    order: getFusionLayerOrder(id),
    category: data.category,
    geometryType,
    source: {
      id: `fusion-${id}`,
      name: "Data Fusion Engine",
      format: "geojson",
    },
    data,
    style,
  };
}

function getFusionLayerOrder(
  id: "buildings" | "roads" | "green" | "water" | "terrain" | "boundaries" | "poi" | "transit"
): number {
  const order: Record<typeof id, number> = {
    buildings: 0,
    roads: 1,
    green: 2,
    water: 3,
    terrain: 4,
    boundaries: 5,
    poi: 6,
    transit: 7,
  };

  return order[id];
}

function toProjectDataSource(state: ReturnType<SourceManager["getStates"]>[number]): ProjectDataSource {
  return {
    id: state.source,
    name: state.source,
    kind: state.source,
    connectedAt: state.updatedAt ?? new Date().toISOString(),
    status: state.status === "error" ? "error" : state.status === "ready" ? "active" : "inactive",
    version: state.version,
    cacheKey: `${state.source}:${state.version}`,
    featureCount: state.featureCount,
    errorMessage: state.errorMessage,
  };
}

function pickBySourcePriority<T extends { source: DataSourceKind }>(
  items: T[],
  priorities: DataSourceKind[]
): T | null {
  for (const source of priorities) {
    const match = items.find((item) => item.source === source);

    if (match) {
      return match;
    }
  }

  return items[0] ?? null;
}

function pickAttribute<T extends keyof SourceBuildingFeature>(
  group: SourceBuildingFeature[],
  key: T,
  priorities: DataSourceKind[]
): SourceBuildingFeature[T] | null {
  for (const source of priorities) {
    const match = group.find((feature) => feature.source === source && feature[key] !== undefined && feature[key] !== null);

    if (match) {
      return match[key] ?? null;
    }
  }

  const fallback = group.find((feature) => feature[key] !== undefined && feature[key] !== null);
  return fallback ? fallback[key] ?? null : null;
}

function buildFeatureProvenance(
  features: Array<SourceFeature | SourceBuildingFeature>,
  primarySource: DataSourceKind,
  attributes: FeatureProvenance["attributes"]
): FeatureProvenance {
  const unique = uniqueSources(features.map((feature) => feature.source));
  const sourceFeatureIds = unique.reduce<FeatureProvenance["sourceFeatureIds"]>((result, source) => {
    result[source] = features
      .filter((feature) => feature.source === source)
      .map((feature) => feature.sourceFeatureId);
    return result;
  }, {});

  return {
    primarySource,
    sourceFeatureIds,
    mergedSources: unique,
    geometrySource: primarySource,
    attributes,
    qualityScore: getSourceConfidence(primarySource) === "high" ? 0.9 : getSourceConfidence(primarySource) === "medium" ? 0.65 : 0.4,
    confidence: getSourceConfidence(primarySource),
  };
}

function buildAttributeProvenance<
  T extends
    | SourceBuildingFeature
    | SourceRoadFeature
    | SourceVegetationFeature
    | SourceWaterFeature
    | SourceTerrainFeature
>(features: T[], key: keyof T): AttributeProvenance[] {
  const timestamp = new Date().toISOString();

  return features
    .filter((feature) => feature[key] !== undefined && feature[key] !== null)
    .map((feature) => ({
      source: feature.source,
      sourceFeatureId: feature.sourceFeatureId,
      origin: "source" as const,
      confidence: getSourceConfidence(feature.source),
      updatedAt: timestamp,
    }));
}

function createDerivedProvenance(
  source: DataSourceKind,
  sourceFeatureId: string,
  note: string
): AttributeProvenance {
  return {
    source: "derived",
    sourceFeatureId,
    origin: "derived",
    confidence: getSourceConfidence(source),
    updatedAt: new Date().toISOString(),
    note,
  };
}

function uniqueSources(values: DataSourceKind[]): DataSourceKind[] {
  return Array.from(new Set(values));
}

function mergeTags(features: SourceBuildingFeature[]): Record<string, string> {
  return features.reduce<Record<string, string>>((result, feature) => {
    Object.entries(feature.tags).forEach(([key, value]) => {
      if (!(key in result)) {
        result[key] = value;
      }
    });
    return result;
  }, {});
}

function mergeNames(features: SourceBuildingFeature[]): Record<string, string> | undefined {
  const entries = features.flatMap((feature) => Object.entries(feature.names ?? {}));

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function areBuildingsRelated(left: SourceBuildingFeature, right: SourceBuildingFeature): boolean {
  const leftBox = getGeometryBox(left.geometry);
  const rightBox = getGeometryBox(right.geometry);

  if (!leftBox || !rightBox) {
    return false;
  }

  const intersectionArea = getIntersectionArea(leftBox, rightBox);
  const minArea = Math.min(getBoxArea(leftBox), getBoxArea(rightBox));

  if (minArea === 0) {
    return false;
  }

  return intersectionArea / minArea >= 0.45;
}

function getGeometryBox(geometry: Geometry): BoundingBox | null {
  const positions = flattenGeometryPositions(geometry);

  if (positions.length === 0) {
    return null;
  }

  return {
    west: Math.min(...positions.map((position) => position[0])),
    south: Math.min(...positions.map((position) => position[1])),
    east: Math.max(...positions.map((position) => position[0])),
    north: Math.max(...positions.map((position) => position[1])),
  };
}

function flattenGeometryPositions(geometry: Geometry): Position[] {
  if (geometry.type === "Point") {
    return [geometry.coordinates as Position];
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates as Position[];
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat() as Position[];
  }

  return [];
}

function getIntersectionArea(left: BoundingBox, right: BoundingBox): number {
  const west = Math.max(left.west, right.west);
  const south = Math.max(left.south, right.south);
  const east = Math.min(left.east, right.east);
  const north = Math.min(left.north, right.north);

  if (east <= west || north <= south) {
    return 0;
  }

  return (east - west) * (north - south);
}

function getBoxArea(box: BoundingBox): number {
  return Math.max(box.east - box.west, 0) * Math.max(box.north - box.south, 0);
}

function normalizeBuildingUsage(value: unknown): FormiqBuilding["usage"] {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";

  if (/apart|жил|resid|house|detached|dorm|hostel/.test(normalized)) return "residential";
  if (/shop|retail|market|office|commercial|торг|магаз|бизнес/.test(normalized)) return "commercial";
  if (/industrial|warehouse|factory|manufact|склад|промыш/.test(normalized)) return "industrial";
  if (/school|university|college|kindergarten|education|школ|вуз|детск/.test(normalized)) return "education";
  if (/hospital|clinic|doctor|health|больниц|поликлин/.test(normalized)) return "healthcare";
  if (/church|chapel|cathedral|mosque|synagogue|temple|церк|храм|мечет/.test(normalized)) return "religious";
  if (/sport|stadium|fitness|спорт|стадион/.test(normalized)) return "sports";
  if (/public|civic|government|админ|муницип/.test(normalized)) return "public";

  if (["apartments", "detached", "house", "residential"].includes(normalized)) {
    return "residential";
  }

  if (["commercial", "retail", "shop", "office"].includes(normalized)) {
    return "commercial";
  }

  if (["industrial", "warehouse", "manufacture"].includes(normalized)) {
    return "industrial";
  }

  if (["school", "university", "college", "kindergarten"].includes(normalized)) {
    return "education";
  }

  if (["hospital", "clinic", "doctors"].includes(normalized)) {
    return "healthcare";
  }

  if (["church", "chapel", "cathedral", "mosque", "synagogue", "temple"].includes(normalized)) {
    return "religious";
  }

  if (["sports_centre", "stadium"].includes(normalized)) {
    return "sports";
  }

  if (["public", "civic", "government"].includes(normalized)) {
    return "public";
  }

  if (normalized === "mixed") {
    return "mixed";
  }

  return "unknown";
}

function normalizeRoadType(value: string | null | undefined): FormiqRoad["roadType"] {
  const normalized = value ?? "other";
  const allowed: FormiqRoad["roadType"][] = [
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "service",
    "pedestrian",
    "footway",
    "cycleway",
    "other",
  ];

  return allowed.includes(normalized as FormiqRoad["roadType"])
    ? (normalized as FormiqRoad["roadType"])
    : "other";
}

function getSourceConfidence(source: DataSourceKind): DataConfidence {
  if (source === "microsoft-buildings" || source === "wikidata" || source === "local-buildings") {
    return "high";
  }

  if (source === "overture" || source === "city-geojson") {
    return "medium";
  }

  if (source === "osm") {
    return "medium";
  }

  return "unknown";
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
