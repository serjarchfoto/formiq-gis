import type { Feature, Geometry, GeoJsonProperties, Position } from "geojson";
import type {
  BuildingSemantic,
  DataConfidence,
  DataSourceKind,
  FeatureProvenance,
  FormiqLineGeometry,
  FormiqPointGeometry,
  FormiqPolygonGeometry,
  RoadSemantic,
  TerrainSemantic,
  VegetationSemantic,
  WaterSemantic,
} from "@/types/formiq";

export function toPolygonGeometry(geometry: Geometry | null | undefined): FormiqPolygonGeometry | null {
  if (!geometry || geometry.type !== "Polygon") {
    return null;
  }

  return {
    type: "polygon",
    rings: geometry.coordinates as Position[][],
  };
}

export function toLineGeometry(geometry: Geometry | null | undefined): FormiqLineGeometry | null {
  if (!geometry || geometry.type !== "LineString") {
    return null;
  }

  return {
    type: "line",
    coordinates: geometry.coordinates as Position[],
  };
}

export function toPointGeometry(
  geometry: Geometry | null | undefined
): FormiqPointGeometry | null {
  if (!geometry || geometry.type !== "Point") {
    return null;
  }

  return {
    type: "point",
    coordinates: geometry.coordinates as Position,
  };
}

export function getFeatureId(feature: Feature<Geometry, GeoJsonProperties>, fallback: string): string {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }

  const candidate =
    feature.properties?.id ??
    feature.properties?.["@id"] ??
    feature.properties?.fid ??
    feature.properties?.wikidata;

  return candidate ? String(candidate) : fallback;
}

export function createEmptyProvenance(
  source: DataSourceKind,
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
    qualityScore: confidence === "high" ? 0.9 : confidence === "medium" ? 0.65 : 0.4,
    confidence,
  };
}

export function createUnknownBuildingSemantic(): BuildingSemantic {
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

export function createUnknownRoadSemantic(): RoadSemantic {
  return {
    importance: "unknown",
    lanes: null,
    transportCategory: "unknown",
    colorGroup: "unknown",
  };
}

export function createUnknownVegetationSemantic(): VegetationSemantic {
  return {
    greenType: "unknown",
    treeDensity: "unknown",
    landscapeCategory: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
  };
}

export function createUnknownWaterSemantic(): WaterSemantic {
  return {
    waterType: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
  };
}

export function createUnknownTerrainSemantic(): TerrainSemantic {
  return {
    slopeCategory: "unknown",
    elevationCategory: "unknown",
    importance: "unknown",
    colorGroup: "unknown",
  };
}
