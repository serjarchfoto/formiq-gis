import { DEFAULT_OSM_LAYER_STYLES } from "@/constants/gis";
import { calculateLineLength, calculatePolygonArea } from "@/utils";
import {
  createUnknownBuildingSemantic,
  createUnknownRoadSemantic,
  createUnknownVegetationSemantic,
  createUnknownWaterSemantic,
  toLineGeometry,
  toPointGeometry,
  toPolygonGeometry,
} from "@/lib/gis-engine/fusion/providers/sourceAdapterUtils";
import { normalizeFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type {
  DataConfidence,
  DataSourceKind,
  FormiqBoundary,
  FormiqBuilding,
  FormiqLayerData,
  FormiqPoi,
  FormiqProjectData,
  FormiqRoad,
  FormiqTerrain,
  FormiqTransitStop,
  FormiqVegetation,
  FormiqWater,
  ProjectLayerState,
} from "@/types/formiq";
import type { GISLayerCategory, GISLayerGeometryType } from "@/types/gis";
import type {
  CanonicalFeature,
  CanonicalProjectProjectionApi,
  CanonicalSnapshot,
  QualityReport,
  TerritoryReference,
} from "./types";
import type { DataHubLogger } from "./Observability";
import { NoopDataHubLogger } from "./Observability";

const LAYER_DEFINITIONS: Array<{
  id: string;
  category: GISLayerCategory;
  geometryType: GISLayerGeometryType;
  style: (typeof DEFAULT_OSM_LAYER_STYLES)[keyof typeof DEFAULT_OSM_LAYER_STYLES];
}> = [
  { id: "buildings", category: "buildings", geometryType: "polygon", style: DEFAULT_OSM_LAYER_STYLES.buildings },
  { id: "roads", category: "roads", geometryType: "line", style: DEFAULT_OSM_LAYER_STYLES.roads },
  { id: "green", category: "green", geometryType: "polygon", style: DEFAULT_OSM_LAYER_STYLES.green },
  { id: "water", category: "water", geometryType: "polygon", style: DEFAULT_OSM_LAYER_STYLES.water },
  { id: "terrain", category: "terrain", geometryType: "point", style: DEFAULT_OSM_LAYER_STYLES.terrain },
  { id: "boundaries", category: "boundaries", geometryType: "polygon", style: DEFAULT_OSM_LAYER_STYLES.boundaries },
  { id: "poi", category: "poi", geometryType: "point", style: DEFAULT_OSM_LAYER_STYLES.poi },
  { id: "transit", category: "transit", geometryType: "point", style: DEFAULT_OSM_LAYER_STYLES.transit },
];

export class CanonicalProjectProjection implements CanonicalProjectProjectionApi {
  constructor(private readonly logger: DataHubLogger = new NoopDataHubLogger()) {}

  async projectSnapshot(input: {
    existingProject: FormiqProjectData;
    canonicalSnapshot: CanonicalSnapshot;
    quality: QualityReport;
    territory: TerritoryReference;
  }): Promise<FormiqProjectData> {
    const startedAt = performanceNow();
    const collections = projectCanonicalFeatures(input.canonicalSnapshot.features);
    const layers = createLayerData(collections, input.territory.bbox);
    const layerSystem = mergeLayerSystem(input.existingProject.layerSystem, layers);
    const existingNonCanonicalLayers = input.existingProject.layers.filter((layer) =>
      !LAYER_DEFINITIONS.some((definition) => definition.category === layer.category)
    );
    const projected = normalizeFormiqProject({
      ...input.existingProject,
      layers: [...existingNonCanonicalLayers, ...layers],
      layerSystem,
      buildings: collections.buildings,
      roads: collections.roads,
      vegetation: collections.vegetation,
      water: collections.water,
      terrain: collections.terrain,
      boundaries: collections.boundaries,
      poi: collections.poi,
      transitStops: collections.transitStops,
      metadata: {
        ...input.existingProject.metadata,
        bounds: toBounds(input.territory.bbox),
        updatedAt: new Date().toISOString(),
      },
    });
    // Quality is deliberately consumed only as a projection input contract.
    // The current FormiqProjectData model has no canonical/quality extension field;
    // existing settings, territory selection and cached legacy views remain intact.
    void input.quality;
    this.logger.emit({ timestamp: new Date().toISOString(), level: "info", operation: "projection", projectId: input.existingProject.id, territoryId: input.territory.id, runId: input.canonicalSnapshot.ingestionRunId, durationMs: performanceNow() - startedAt, message: "Canonical snapshot projected to the compatibility project model.", details: { featureCount: input.canonicalSnapshot.features.length } });
    return projected;
  }
}

function performanceNow(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

export interface CanonicalProjectedCollections {
  buildings: FormiqBuilding[];
  roads: FormiqRoad[];
  vegetation: FormiqVegetation[];
  water: FormiqWater[];
  terrain: FormiqTerrain[];
  boundaries: FormiqBoundary[];
  poi: FormiqPoi[];
  transitStops: FormiqTransitStop[];
}

/** Pure compatibility projection shared by project and analysis read models. */
export function projectCanonicalFeatures(features: CanonicalFeature[]): CanonicalProjectedCollections {
  const collections = { buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [] } as {
    buildings: FormiqBuilding[]; roads: FormiqRoad[]; vegetation: FormiqVegetation[]; water: FormiqWater[];
    terrain: FormiqTerrain[]; boundaries: FormiqBoundary[]; poi: FormiqPoi[]; transitStops: FormiqTransitStop[];
  };
  for (const feature of features.filter((candidate) => candidate.preferred)) {
    switch (feature.domain) {
      case "building": collections.buildings.push(projectBuilding(feature)); break;
      case "road": collections.roads.push(projectRoad(feature)); break;
      case "green_area": collections.vegetation.push(projectVegetation(feature)); break;
      case "waterbody": collections.water.push(projectWater(feature)); break;
      case "terrain": collections.terrain.push(projectTerrain(feature)); break;
      case "boundary": collections.boundaries.push(projectBoundary(feature)); break;
      case "poi": collections.poi.push(projectPoi(feature)); break;
      case "transport_stop": collections.transitStops.push(projectTransitStop(feature)); break;
      default: break;
    }
  }
  return collections;
}

function projectBuilding(feature: CanonicalFeature): FormiqBuilding {
  const geometry = toPolygonGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "building polygon");
  const attributes = feature.attributes;
  const levels = numberOrNull(attributes.levels);
  const height = numberOrNull(attributes.height);
  return {
    id: feature.id, type: "building", geometry, height, absoluteHeight: null,
    relativeHeight: height ?? (levels !== null ? levels * 3.2 : null),
    heightFromLevels: levels !== null ? levels * 3.2 : null,
    levels, baseElevation: null, area: calculatePolygonArea(geometry),
    volume: height !== null ? calculatePolygonArea(geometry) * height : null,
    year: numberOrNull(attributes.year), usage: buildingUsage(attributes.usage),
    material: stringOrNull(attributes.material), roof: stringOrNull(attributes.roof),
    objectType: stringOrNull(attributes.objectType), addressLabel: stringOrNull(attributes.addressLabel),
    semantic: (attributes.semantic as FormiqBuilding["semantic"] | undefined) ?? createUnknownBuildingSemantic(),
    threeD: (attributes.threeD as FormiqBuilding["threeD"] | undefined) ?? defaultBuilding3D(height, levels),
    tags: stringRecord(attributes.tags), names: nameRecord(attributes.name), source: primarySource(feature),
    confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active",
  };
}

function projectRoad(feature: CanonicalFeature): FormiqRoad {
  const geometry = toLineGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "road line");
  const attributes = feature.attributes;
  return {
    id: feature.id, type: "road", geometry, length: calculateLineLength(geometry),
    roadType: roadType(attributes.roadType), surface: stringOrNull(attributes.surface),
    name: stringOrNull(attributes.name), lanes: numberOrNull(attributes.lanes),
    semantic: (attributes.semantic as FormiqRoad["semantic"] | undefined) ?? createUnknownRoadSemantic(),
    tags: stringRecord(attributes.tags), names: nameRecord(attributes.name), source: primarySource(feature),
    confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active",
  };
}

function projectVegetation(feature: CanonicalFeature): FormiqVegetation {
  const geometry = toPolygonGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "green polygon");
  return {
    id: feature.id, type: "vegetation", geometry, area: calculatePolygonArea(geometry),
    vegetationType: stringOrNull(feature.attributes.vegetationType),
    semantic: (feature.attributes.semantic as FormiqVegetation["semantic"] | undefined) ?? createUnknownVegetationSemantic(),
    tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature),
    confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active",
  };
}

function projectWater(feature: CanonicalFeature): FormiqWater {
  const geometry = toPolygonGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "water polygon");
  return {
    id: feature.id, type: "water", geometry, area: calculatePolygonArea(geometry),
    waterType: stringOrNull(feature.attributes.waterType),
    semantic: (feature.attributes.semantic as FormiqWater["semantic"] | undefined) ?? createUnknownWaterSemantic(),
    tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature),
    confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active",
  };
}

function projectTerrain(feature: CanonicalFeature): FormiqTerrain {
  const geometry = toPointGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "terrain point");
  return {
    id: feature.id, type: "terrain", geometry, elevation: numberOrNull(feature.attributes.elevation), slope: numberOrNull(feature.attributes.slope),
    semantic: feature.attributes.semantic as FormiqTerrain["semantic"] ?? { slopeCategory: "unknown", elevationCategory: "unknown", importance: "unknown", colorGroup: "unknown" },
    tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature), confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active",
  };
}

function projectBoundary(feature: CanonicalFeature): FormiqBoundary {
  const geometry = toPolygonGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "boundary polygon");
  return { id: feature.id, type: "boundary", geometry, adminLevel: stringOrNull(feature.attributes.adminLevel), name: stringOrNull(feature.attributes.name), tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature), confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active" };
}

function projectPoi(feature: CanonicalFeature): FormiqPoi {
  const geometry = toPointGeometry(feature.geometry) ?? toPolygonGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "POI geometry");
  return { id: feature.id, type: "poi", geometry, category: stringOrNull(feature.attributes.category) ?? "poi", subtype: stringOrNull(feature.attributes.subtype), name: stringOrNull(feature.attributes.name), tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature), confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active" };
}

function projectTransitStop(feature: CanonicalFeature): FormiqTransitStop {
  const geometry = toPointGeometry(feature.geometry);
  if (!geometry) throw projectionError(feature, "transit stop point");
  return { id: feature.id, type: "transit-stop", geometry, network: stringOrNull(feature.attributes.network), stopType: stringOrNull(feature.attributes.stopType), name: stringOrNull(feature.attributes.name), tags: stringRecord(feature.attributes.tags), names: nameRecord(feature.attributes.name), source: primarySource(feature), confidence: confidence(feature), provenance: toLegacyProvenance(feature), lifecycleState: "active" };
}

function createLayerData(collections: CanonicalProjectedCollections, bounds: [number, number, number, number]): FormiqLayerData[] {
  const now = new Date().toISOString();
  const byCategory: Partial<Record<GISLayerCategory, FormiqLayerData>> = {
    buildings: { category: "buildings", buildings: collections.buildings, roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.buildings.length } },
    roads: { category: "roads", buildings: [], roads: collections.roads, vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.roads.length } },
    green: { category: "green", buildings: [], roads: [], vegetation: collections.vegetation, water: [], terrain: [], boundaries: [], poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.vegetation.length } },
    water: { category: "water", buildings: [], roads: [], vegetation: [], water: collections.water, terrain: [], boundaries: [], poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.water.length } },
    terrain: { category: "terrain", buildings: [], roads: [], vegetation: [], water: [], terrain: collections.terrain, boundaries: [], poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.terrain.length } },
    boundaries: { category: "boundaries", buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: collections.boundaries, poi: [], transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.boundaries.length } },
    poi: { category: "poi", buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: collections.poi, transitStops: [], metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.poi.length } },
    transit: { category: "transit", buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: collections.transitStops, metadata: { source: "Data Hub", importedAt: now, bounds: toBounds(bounds), featureCount: collections.transitStops.length } },
  };
  return LAYER_DEFINITIONS.map((definition) => byCategory[definition.category]!).filter(Boolean);
}

function mergeLayerSystem(existing: ProjectLayerState[], dataLayers: FormiqLayerData[]): ProjectLayerState[] {
  const existingByCategory = new Map(existing.map((layer) => [layer.category, layer]));
  const incoming = LAYER_DEFINITIONS.map((definition, index) => {
    const previous = existingByCategory.get(definition.category);
    return {
      ...(previous ?? {}), id: previous?.id ?? definition.id, name: previous?.name ?? definition.category,
      visible: previous?.visible ?? true, opacity: previous?.opacity ?? definition.style.opacity ?? 1,
      sourceType: previous?.sourceType ?? "fusion", removable: previous?.removable ?? false, order: previous?.order ?? index,
      category: definition.category, geometryType: definition.geometryType,
      source: previous?.source ?? { id: "data-hub", name: "Data Hub", format: "geojson" },
      style: previous?.style ?? definition.style, data: dataLayers.find((layer) => layer.category === definition.category),
    } satisfies ProjectLayerState;
  });
  const preserved = existing.filter((layer) => !LAYER_DEFINITIONS.some((definition) => definition.category === layer.category));
  return [...incoming, ...preserved].sort((left, right) => left.order - right.order).map((layer, index) => ({ ...layer, order: index }));
}

function toLegacyProvenance(feature: CanonicalFeature): FormiqBuilding["provenance"] {
  const sourceFeatureIds = feature.provenance.reduce<FormiqBuilding["provenance"]["sourceFeatureIds"]>((result, provenance) => {
    const source = provenance.sourceId as DataSourceKind;
    result[source] = [...(result[source] ?? []), ...(provenance.sourceFeatureId ? [provenance.sourceFeatureId] : [])];
    return result;
  }, {});
  const primary = primarySource(feature);
  return { primarySource: primary, sourceFeatureIds, mergedSources: [...new Set(feature.provenance.map((item) => item.sourceId as DataSourceKind))], geometrySource: primary, attributes: {}, qualityScore: feature.overallConfidence ?? 0, confidence: confidence(feature) };
}

function primarySource(feature: CanonicalFeature): DataSourceKind | "unknown" { return (feature.provenance[0]?.sourceId as DataSourceKind | undefined) ?? "unknown"; }
function confidence(feature: CanonicalFeature): DataConfidence { const score = feature.overallConfidence ?? 0; return score >= 0.8 ? "high" : score >= 0.5 ? "medium" : score > 0 ? "low" : "unknown"; }
function toBounds(bounds: [number, number, number, number]) { return { west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3] }; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringOrNull(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function stringRecord(value: unknown): Record<string, string> { return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)])) : {}; }
function nameRecord(value: unknown): Record<string, string> | undefined { return typeof value === "string" && value ? { default: value } : undefined; }
function buildingUsage(value: unknown): FormiqBuilding["usage"] { return ["residential", "commercial", "industrial", "public", "education", "healthcare", "religious", "sports", "mixed"].includes(String(value)) ? value as FormiqBuilding["usage"] : "unknown"; }
function roadType(value: unknown): FormiqRoad["roadType"] { const allowed = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "service", "pedestrian", "footway", "cycleway"]; return allowed.includes(String(value)) ? value as FormiqRoad["roadType"] : "other"; }
function defaultBuilding3D(height: number | null, levels: number | null): FormiqBuilding["threeD"] { const relativeHeight = height ?? (levels !== null ? levels * 3.2 : null); return { absoluteHeight: null, relativeHeight, heightFromLevels: levels !== null ? levels * 3.2 : null, baseElevation: null, volume: null, whiteModel: { extrusionHeight: relativeHeight, extrusionMode: height !== null ? "absolute-height" : levels !== null ? "levels-derived" : "unknown", baseElevation: null, materialProfile: "white-model-default", colorSchemeId: "building-neutral" }, semantic3D: { semanticColorGroup: "unknown", materialId: "semantic-building-default", renderPriority: 10 } }; }
function projectionError(feature: CanonicalFeature, expected: string): Error { return new Error(`Canonical projection failed for ${feature.id}: expected ${expected}.`); }
