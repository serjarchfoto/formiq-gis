import { createEmptyFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type {
  DataConfidence,
  FeatureLifecycleState,
  FeatureProvenance,
  FormiqBuilding,
  FormiqPoi,
  FormiqProjectData,
  FormiqRoad,
  FormiqTerrain,
  FormiqTransitStop,
  FormiqVegetation,
  FormiqWater,
} from "@/types/formiq";

const bounds = { west: 37.6, south: 55.7, east: 37.62, north: 55.72 };
const polygon = {
  type: "polygon" as const,
  rings: [
    [
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
      [bounds.west, bounds.south],
    ],
  ],
};

export function createAnalysisFixtureProject(): FormiqProjectData {
  const project = createEmptyFormiqProject();
  const territoryId = "territory-analysis-fixture";

  return {
    ...project,
    id: "analysis-fixture",
    name: "Analysis fixture",
    activeTerritoryId: territoryId,
    metadata: { ...project.metadata, bounds },
    territories: [
      {
        id: territoryId,
        name: "Test territory",
        type: "study-area",
        geometry: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: polygon.rings },
        },
        bounds,
        loadingBuffer: { distanceMeters: 0, bounds },
        analysisSettings: {
          includeBufferInImport: false,
          calculateOnlyInsideWorkingArea: true,
        },
        thematicMapIds: [],
        analysisResultIds: [],
        createdAt: project.metadata.createdAt,
        updatedAt: project.metadata.updatedAt,
        isActive: true,
        status: "editing",
        locked: false,
      },
    ],
    buildings: [createBuilding("building-known", false), createBuilding("building-unknown", true)],
    roads: [createRoad()],
    vegetation: [createVegetation()],
    water: [createWater()],
    terrain: [createTerrain()],
    poi: [createPoi()],
    transitStops: [createTransitStop()],
  };
}

function createBuilding(id: string, unknown: boolean): FormiqBuilding {
  return {
    ...baseEntity(id),
    type: "building",
    geometry: polygon,
    height: unknown ? null : 12,
    absoluteHeight: unknown ? null : 12,
    relativeHeight: unknown ? null : 12,
    heightFromLevels: unknown ? null : 9.6,
    levels: unknown ? null : 3,
    baseElevation: 0,
    area: unknown ? 2_000 : 200,
    volume: unknown ? null : 2_400,
    year: unknown ? null : 1990,
    usage: unknown ? "unknown" : "residential",
    material: unknown ? null : "brick",
    roof: unknown ? null : "flat",
    objectType: unknown ? null : "apartments",
    addressLabel: unknown ? null : "Test street",
    semantic: {
      heightCategory: unknown ? "unknown" : "low",
      ageCategory: unknown ? "unknown" : "post-soviet",
      functionCategory: unknown ? "unknown" : "residential",
      densityCategory: unknown ? "unknown" : "small-footprint",
      importance: unknown ? "unknown" : "medium",
      colorGroup: unknown ? "unknown" : "building-low",
      transportRelation: "unknown",
      greenRelation: "unknown",
      isHistoric: false,
      isPublic: false,
      isResidential: !unknown,
    },
    threeD: {
      absoluteHeight: unknown ? null : 12,
      relativeHeight: unknown ? null : 12,
      heightFromLevels: unknown ? null : 9.6,
      baseElevation: 0,
      volume: unknown ? null : 2_400,
      whiteModel: {
        extrusionHeight: unknown ? null : 12,
        extrusionMode: unknown ? "unknown" : "absolute-height",
        baseElevation: 0,
        materialProfile: "white",
        colorSchemeId: "default",
      },
      semantic3D: {
        semanticColorGroup: unknown ? "unknown" : "building-low",
        materialId: "building",
        renderPriority: 1,
      },
    },
  };
}

function createRoad(): FormiqRoad {
  return {
    ...baseEntity("road-primary"),
    type: "road",
    geometry: {
      type: "line",
      coordinates: [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
    },
    length: 1_200,
    roadType: "primary",
    surface: "asphalt",
    name: "Test road",
    lanes: 2,
    semantic: {
      importance: "high",
      lanes: 2,
      transportCategory: "city",
      colorGroup: "road-primary",
    },
  };
}

function createVegetation(): FormiqVegetation {
  return {
    ...baseEntity("vegetation-park"),
    type: "vegetation",
    geometry: polygon,
    area: 600,
    vegetationType: "park",
    semantic: {
      greenType: "park",
      treeDensity: "medium",
      landscapeCategory: "park",
      importance: "medium",
      colorGroup: "green",
    },
  };
}

function createWater(): FormiqWater {
  return {
    ...baseEntity("water-river"),
    type: "water",
    geometry: polygon,
    area: 300,
    waterType: "river",
    semantic: { waterType: "river", importance: "medium", colorGroup: "water" },
  };
}

function createTerrain(): FormiqTerrain {
  return {
    ...baseEntity("terrain-unknown"),
    type: "terrain",
    geometry: { type: "point", coordinates: [37.61, 55.71] },
    elevation: 156,
    slope: null,
    semantic: {
      slopeCategory: "unknown",
      elevationCategory: "unknown",
      importance: "unknown",
      colorGroup: "terrain",
    },
  };
}

function createPoi(): FormiqPoi {
  return {
    ...baseEntity("poi-school"),
    type: "poi",
    geometry: { type: "point", coordinates: [37.606, 55.706] },
    category: "school",
    subtype: "education",
    name: "Test school",
  };
}

function createTransitStop(): FormiqTransitStop {
  return {
    ...baseEntity("transit-bus"),
    type: "transit-stop",
    geometry: { type: "point", coordinates: [37.614, 55.714] },
    network: "test-network",
    stopType: "bus",
    name: "Test stop",
  };
}

function baseEntity(id: string) {
  return {
    id,
    tags: { source_name: "analysis-fixture" },
    names: { default: id },
    source: "manual" as const,
    confidence: "high" as DataConfidence,
    provenance: emptyProvenance(id),
    lifecycleState: "active" as FeatureLifecycleState,
  };
}

function emptyProvenance(id: string): FeatureProvenance {
  return {
    primarySource: "manual",
    sourceFeatureIds: { manual: [id] },
    mergedSources: ["manual"],
    geometrySource: "manual",
    attributes: {},
    qualityScore: 1,
    confidence: "high",
  };
}
