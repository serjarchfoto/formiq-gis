import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { FormiqEntity } from "@/types/formiq";

export function createThematicFeature(
  entity: FormiqEntity,
  category: string,
  legendGroup: string,
  renderColor: string
): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id: entity.id,
    properties: {
      id: entity.id,
      type: entity.type,
      category,
      legendGroup,
      renderColor,
      geometrySource: entity.source,
    },
    geometry: toGeoJsonGeometry(entity.geometry),
  };
}

function toGeoJsonGeometry(geometry: FormiqEntity["geometry"]): Geometry {
  if (geometry.type === "point") {
    return {
      type: "Point",
      coordinates: geometry.coordinates,
    };
  }

  if (geometry.type === "line") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates,
    };
  }

  return {
    type: "Polygon",
    coordinates: geometry.rings,
  };
}
