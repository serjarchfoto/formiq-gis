import type { Position } from "geojson";
import type { OverpassElement, OverpassResponse } from "@/services/overpass";
import type { BoundingBox, GISLayer, GISLayerCategory, GISLayerGeometryType } from "@/types/gis";
import type {
  DataConfidence,
  BuildingSemantic,
  BuildingUsage,
  FeatureProvenance,
  FormiqBuilding,
  FormiqLayerData,
  FormiqLineGeometry,
  FormiqPolygonGeometry,
  FormiqRoad,
  FormiqVegetation,
  FormiqWater,
  RoadSemantic,
  RoadType,
  VegetationSemantic,
  WaterSemantic,
} from "@/types/formiq";
import { DEFAULT_OSM_LAYER_STYLES } from "@/constants/gis";
import { calculateLineLength, calculatePolygonArea } from "@/utils";
import { SemanticEngine } from "./semantic";

type OSMCategory = Extract<GISLayerCategory, "buildings" | "roads" | "green" | "water">;

const semanticEngine = new SemanticEngine();

/**
 * @deprecated Legacy presentation-layer normalizer retained for existing callers only.
 * Data Hub ingestion uses OSMSourceNormalizer and must never import this module.
 */
export function normalizeOSMResponseToFormiqLayers(
  response: OverpassResponse,
  bounds: BoundingBox
): GISLayer[] {
  const layerData: Record<OSMCategory, FormiqLayerData> = {
    buildings: createEmptyLayerData("buildings", bounds),
    roads: createEmptyLayerData("roads", bounds),
    green: createEmptyLayerData("green", bounds),
    water: createEmptyLayerData("water", bounds),
  };

  response.elements.forEach((element) => {
    const category = getCategory(element.tags);

    if (!category || !element.geometry || element.geometry.length < 2) {
      return;
    }

    if (category === "buildings") {
      const building = normalizeBuilding(element);

      if (building) {
        layerData.buildings.buildings.push(building);
      }
    }

    if (category === "roads") {
      const road = normalizeRoad(element);

      if (road) {
        layerData.roads.roads.push(road);
      }
    }

    if (category === "green") {
      const vegetation = normalizeVegetation(element);

      if (vegetation) {
        layerData.green.vegetation.push(vegetation);
      }
    }

    if (category === "water") {
      const water = normalizeWater(element);

      if (water) {
        layerData.water.water.push(water);
      }
    }
  });

  Object.values(layerData).forEach((data) => {
    data.metadata.featureCount =
      data.buildings.length +
      data.roads.length +
      data.vegetation.length +
      data.water.length +
      data.terrain.length;
  });

  const semanticLayerData: Record<OSMCategory, FormiqLayerData> = {
    buildings: semanticEngine.analyzeLayer(layerData.buildings),
    roads: semanticEngine.analyzeLayer(layerData.roads),
    green: semanticEngine.analyzeLayer(layerData.green),
    water: semanticEngine.analyzeLayer(layerData.water),
  };

  return [
    createGISLayer("buildings", "Здания OSM", "polygon", semanticLayerData.buildings),
    createGISLayer("roads", "Дороги OSM", "line", semanticLayerData.roads),
    createGISLayer("green", "Озеленение OSM", "polygon", semanticLayerData.green),
    createGISLayer("water", "Водоёмы OSM", "polygon", semanticLayerData.water),
  ];
}

function normalizeBuilding(element: OverpassElement): FormiqBuilding | null {
  const geometry = toPolygonGeometry(element);

  if (!geometry) {
    return null;
  }

  const tags = element.tags ?? {};

  return {
    id: createEntityId(element),
    type: "building",
    geometry,
    height: parseNumber(tags.height),
    absoluteHeight: null,
    relativeHeight: parseNumber(tags.height),
    heightFromLevels: parseNumber(tags["building:levels"])
      ? Number((parseNumber(tags["building:levels"])! * 3.2).toFixed(2))
      : null,
    levels: parseNumber(tags["building:levels"]),
    baseElevation: null,
    area: calculatePolygonArea(geometry),
    volume: null,
    year: parseYear(tags.start_date ?? tags["building:year"] ?? tags.year),
    usage: getBuildingUsage(tags),
    material: tags["building:material"] ?? tags.material ?? null,
    roof: tags["roof:shape"] ?? tags.roof ?? null,
    objectType: tags.building ?? null,
    addressLabel: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || null,
    semantic: createUnknownBuildingSemantic(),
    source: "osm",
    confidence: "medium",
    lifecycleState: "active",
    provenance: createSimpleProvenance("osm", createEntityId(element), "medium"),
    threeD: {
      absoluteHeight: null,
      relativeHeight: parseNumber(tags.height),
      heightFromLevels: parseNumber(tags["building:levels"])
        ? Number((parseNumber(tags["building:levels"])! * 3.2).toFixed(2))
        : null,
      baseElevation: null,
      volume: null,
      whiteModel: {
        extrusionHeight: parseNumber(tags.height),
        extrusionMode: parseNumber(tags.height) ? "absolute-height" : "unknown",
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
    tags,
  };
}

function normalizeRoad(element: OverpassElement): FormiqRoad | null {
  const geometry = toLineGeometry(element);

  if (!geometry) {
    return null;
  }

  const tags = element.tags ?? {};

  return {
    id: createEntityId(element),
    type: "road",
    geometry,
    length: calculateLineLength(geometry),
    roadType: getRoadType(tags.highway),
    surface: tags.surface ?? null,
    name: tags.name ?? null,
    lanes: parseNumber(tags.lanes),
    semantic: createUnknownRoadSemantic(),
    source: "osm",
    confidence: "medium",
    lifecycleState: "active",
    provenance: createSimpleProvenance("osm", createEntityId(element), "medium"),
    tags,
  };
}

function normalizeVegetation(element: OverpassElement): FormiqVegetation | null {
  const geometry = toPolygonGeometry(element);

  if (!geometry) {
    return null;
  }

  const tags = element.tags ?? {};

  return {
    id: createEntityId(element),
    type: "vegetation",
    geometry,
    area: calculatePolygonArea(geometry),
    vegetationType: tags.landuse ?? tags.leisure ?? tags.natural ?? null,
    semantic: createUnknownVegetationSemantic(),
    source: "osm",
    confidence: "medium",
    lifecycleState: "active",
    provenance: createSimpleProvenance("osm", createEntityId(element), "medium"),
    tags,
  };
}

function normalizeWater(element: OverpassElement): FormiqWater | null {
  const geometry = toPolygonGeometry(element);

  if (!geometry) {
    return null;
  }

  const tags = element.tags ?? {};

  return {
    id: createEntityId(element),
    type: "water",
    geometry,
    area: calculatePolygonArea(geometry),
    waterType: tags.water ?? tags.waterway ?? tags.natural ?? null,
    semantic: createUnknownWaterSemantic(),
    source: "osm",
    confidence: "medium",
    lifecycleState: "active",
    provenance: createSimpleProvenance("osm", createEntityId(element), "medium"),
    tags,
  };
}

function getCategory(tags: Record<string, string> | undefined): OSMCategory | null {
  if (!tags) {
    return null;
  }

  if (tags.building) {
    return "buildings";
  }

  if (tags.highway) {
    return "roads";
  }

  if (tags.natural === "water" || tags.water || tags.waterway) {
    return "water";
  }

  if (tags.landuse || tags.leisure === "park" || tags.leisure === "garden" || tags.natural) {
    return "green";
  }

  return null;
}

function toPolygonGeometry(element: OverpassElement): FormiqPolygonGeometry | null {
  const coordinates = toCoordinates(element);

  if (coordinates.length < 4 || !isClosedRing(coordinates)) {
    return null;
  }

  return {
    type: "polygon",
    rings: [coordinates],
  };
}

function toLineGeometry(element: OverpassElement): FormiqLineGeometry | null {
  const coordinates = toCoordinates(element);

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: "line",
    coordinates,
  };
}

function toCoordinates(element: OverpassElement): Position[] {
  return (element.geometry ?? []).map((point) => [point.lon, point.lat]);
}

function createEmptyLayerData(category: OSMCategory, bounds: BoundingBox): FormiqLayerData {
  return {
    category,
    buildings: [],
    roads: [],
    vegetation: [],
    water: [],
    terrain: [],
    metadata: {
      source: "OpenStreetMap / Overpass API",
      importedAt: new Date().toISOString(),
      bounds,
      featureCount: 0,
    },
  };
}

function createGISLayer(
  category: OSMCategory,
  name: string,
  geometryType: GISLayerGeometryType,
  data: FormiqLayerData
): GISLayer {
  return {
    id: category,
    name,
    visible: true,
    opacity: DEFAULT_OSM_LAYER_STYLES[category].opacity ?? 1,
    sourceType: "osm",
    removable: false,
    order: getCategoryOrder(category),
    category,
    geometryType,
    source: {
      id: `overpass-${category}`,
      name: "OpenStreetMap / Overpass API",
      format: "osm",
    },
    data,
    style: DEFAULT_OSM_LAYER_STYLES[category],
  };
}

function getCategoryOrder(category: OSMCategory): number {
  const order: Record<OSMCategory, number> = {
    buildings: 0,
    roads: 1,
    green: 2,
    water: 3,
  };

  return order[category];
}

function getBuildingUsage(tags: Record<string, string>): BuildingUsage {
  const value = tags.building ?? tags.amenity ?? tags.shop ?? tags.office ?? tags.landuse;

  if (!value) {
    return "unknown";
  }

  if (["apartments", "detached", "house", "residential"].includes(value)) {
    return "residential";
  }

  if (["commercial", "retail", "shop", "office"].includes(value)) {
    return "commercial";
  }

  if (["industrial", "warehouse", "manufacture"].includes(value)) {
    return "industrial";
  }

  if (["school", "university", "college", "kindergarten"].includes(value)) {
    return "education";
  }

  if (["hospital", "clinic", "doctors"].includes(value)) {
    return "healthcare";
  }

  if (["church", "chapel", "cathedral", "mosque", "synagogue", "temple"].includes(value)) {
    return "religious";
  }

  if (["sports_centre", "stadium"].includes(value)) {
    return "sports";
  }

  if (["public", "civic", "government"].includes(value)) {
    return "public";
  }

  return "unknown";
}

function getRoadType(value: string | undefined): RoadType {
  if (!value) {
    return "other";
  }

  const allowedRoadTypes: RoadType[] = [
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
  ];

  return allowedRoadTypes.includes(value as RoadType) ? (value as RoadType) : "other";
}

function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsedValue = Number.parseFloat(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseYear(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\d{4}/);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[0], 10);

  return Number.isFinite(year) ? year : null;
}

function createUnknownBuildingSemantic(): BuildingSemantic {
  return {
    heightCategory: "unknown",
    ageCategory: "unknown",
    functionCategory: "unknown",
    densityCategory: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
    transportRelation: "unknown",
    greenRelation: "unknown",
    isHistoric: false,
    isPublic: false,
    isResidential: false,
  };
}

function createUnknownRoadSemantic(): RoadSemantic {
  return {
    importance: "unknown",
    lanes: null,
    transportCategory: "unknown",
    colorGroup: "unknown",
  };
}

function createUnknownVegetationSemantic(): VegetationSemantic {
  return {
    greenType: "unknown",
    treeDensity: "unknown",
    landscapeCategory: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
  };
}

function createUnknownWaterSemantic(): WaterSemantic {
  return {
    waterType: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
  };
}

function createEntityId(element: OverpassElement): string {
  return `osm-${element.type}-${element.id}`;
}

function createSimpleProvenance(
  source: "osm",
  sourceFeatureId: string,
  confidence: DataConfidence
): FeatureProvenance {
  return {
    primarySource: source,
    sourceFeatureIds: {
      [source]: [sourceFeatureId],
    },
    mergedSources: [source],
    geometrySource: source,
    attributes: {},
    qualityScore: confidence === "medium" ? 0.65 : 0.4,
    confidence,
  };
}

function isClosedRing(coordinates: Position[]): boolean {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  return Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
}
