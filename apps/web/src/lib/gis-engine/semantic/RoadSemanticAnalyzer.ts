import type {
  FormiqRoad,
  RoadSemantic,
  SemanticColorGroup,
  SemanticImportance,
  TransportCategory,
} from "@/types/formiq";

export class RoadSemanticAnalyzer {
  analyze(road: FormiqRoad): RoadSemantic {
    const transportCategory = getTransportCategory(road.roadType);

    return {
      importance: getImportance(transportCategory),
      lanes: road.lanes,
      transportCategory,
      colorGroup: getColorGroup(transportCategory),
    };
  }
}

function getTransportCategory(roadType: FormiqRoad["roadType"]): TransportCategory {
  if (["motorway", "trunk"].includes(roadType)) {
    return "regional";
  }

  if (["primary", "secondary", "tertiary"].includes(roadType)) {
    return "city";
  }

  if (roadType === "residential") {
    return "local";
  }

  if (roadType === "service") {
    return "service";
  }

  if (["pedestrian", "footway"].includes(roadType)) {
    return "pedestrian";
  }

  if (roadType === "cycleway") {
    return "cycle";
  }

  return "unknown";
}

function getImportance(transportCategory: TransportCategory): SemanticImportance {
  if (transportCategory === "regional") {
    return "critical";
  }

  if (transportCategory === "city") {
    return "high";
  }

  if (["local", "pedestrian", "cycle"].includes(transportCategory)) {
    return "medium";
  }

  if (transportCategory === "service") {
    return "low";
  }

  return "unknown";
}

function getColorGroup(transportCategory: TransportCategory): SemanticColorGroup {
  if (["regional", "city"].includes(transportCategory)) {
    return "road-primary";
  }

  if (["local", "service", "pedestrian", "cycle"].includes(transportCategory)) {
    return "road-secondary";
  }

  return "unknown";
}
