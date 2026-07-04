import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type {
  FormiqEntity,
  FormiqLayerData,
  FormiqLineGeometry,
  FormiqPointGeometry,
  FormiqPolygonGeometry,
} from "@/types/formiq";

export function formiqLayerDataToFeatureCollection(
  data: FormiqLayerData
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [
      ...data.buildings.map(toFeature),
      ...data.roads.map(toFeature),
      ...data.vegetation.map(toFeature),
      ...data.water.map(toFeature),
      ...data.terrain.map(toFeature),
      ...(data.boundaries ?? []).map(toFeature),
      ...(data.poi ?? []).map(toFeature),
      ...(data.transitStops ?? []).map(toFeature),
    ],
  };
}

function toFeature(entity: FormiqEntity): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id: entity.id,
    properties: {
      id: entity.id,
      type: entity.type,
      source: entity.source,
      confidence: entity.confidence,
      ...getEntityStyleProperties(entity),
      ...entity.tags,
    },
    geometry: toGeoJsonGeometry(entity.geometry),
  };
}

function getEntityStyleProperties(entity: FormiqEntity): GeoJsonProperties {
  if (entity.type === "building") {
    return {
      levels: entity.levels,
      height: entity.height,
      usage: entity.usage,
      heightCategory: entity.semantic.heightCategory,
      ageCategory: entity.semantic.ageCategory,
      functionCategory: entity.semantic.functionCategory,
      colorGroup: entity.semantic.colorGroup,
    };
  }

  if (entity.type === "road") {
    return {
      roadType: entity.roadType,
      surface: entity.surface,
      name: entity.name,
      lanes: entity.lanes,
      transportCategory: entity.semantic.transportCategory,
    };
  }

  if (entity.type === "vegetation") {
    return {
      vegetationType: entity.vegetationType,
      landscapeCategory: entity.semantic.landscapeCategory,
    };
  }

  if (entity.type === "water") {
    return {
      waterType: entity.waterType,
      importance: entity.semantic.importance,
    };
  }

  if (entity.type === "terrain") {
    return {
      elevation: entity.elevation,
      slope: entity.slope,
      slopeCategory: entity.semantic.slopeCategory,
    };
  }

  if (entity.type === "boundary") {
    return {
      name: entity.name,
      adminLevel: entity.adminLevel,
    };
  }

  if (entity.type === "poi") {
    return {
      category: entity.category,
      subtype: entity.subtype,
      name: entity.name,
    };
  }

  if (entity.type === "transit-stop") {
    return {
      network: entity.network,
      stopType: entity.stopType,
      name: entity.name,
    };
  }

  return {};
}

function toGeoJsonGeometry(geometry: FormiqEntity["geometry"]): Geometry {
  if (geometry.type === "point") {
    return toPointGeometry(geometry);
  }

  if (geometry.type === "line") {
    return toLineGeometry(geometry);
  }

  return toPolygonGeometry(geometry);
}

function toPointGeometry(geometry: FormiqPointGeometry): Geometry {
  return {
    type: "Point",
    coordinates: geometry.coordinates,
  };
}

function toLineGeometry(geometry: FormiqLineGeometry): Geometry {
  return {
    type: "LineString",
    coordinates: geometry.coordinates,
  };
}

function toPolygonGeometry(geometry: FormiqPolygonGeometry): Geometry {
  return {
    type: "Polygon",
    coordinates: geometry.rings,
  };
}
