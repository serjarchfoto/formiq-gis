import type { AnalysisDataRequirement, CanonicalDomain } from "@/lib/gis-engine/data-hub";

export interface AnalysisDefinition {
  id: string;
  title: string;
  requirements: AnalysisDataRequirement[];
  supportsDegradedMode: boolean;
  /** At least one of these domains must contain a feature. */
  requiresAnyDomain?: CanonicalDomain[];
}

const buildingRequirement: AnalysisDataRequirement = {
  domain: "building",
  required: true,
  minimumQuality: 0.5,
};

export const ANALYSIS_REQUIREMENTS: Readonly<Record<string, AnalysisDefinition>> = {
  "floor-count": definition("floor-count", "Этажность застройки", [buildingRequirement], true),
  "building-age": definition("building-age", "Возраст зданий", [buildingRequirement], true),
  "building-function": definition("building-function", "Функции зданий", [buildingRequirement], true),
  "built-density": definition("built-density", "Плотность застройки", [buildingRequirement], true),
  "population-density": definition("population-density", "Плотность населения", [buildingRequirement], true),
  roads: definition("roads", "Дорожная сеть", [{ domain: "road", required: true, minimumQuality: 0.5 }], true),
  greenery: definition("greenery", "Озеленение", [{ domain: "green_area", required: true, minimumQuality: 0.5 }], true),
  water: definition("water", "Водные объекты", [{ domain: "waterbody", required: true, minimumQuality: 0.5 }], true),
  "poi-transit": {
    ...definition("poi-transit", "POI и остановки", [
      { domain: "poi", required: false, minimumQuality: 0.4 },
      { domain: "transport_stop", required: false, minimumQuality: 0.4 },
    ], true),
    requiresAnyDomain: ["poi", "transport_stop"],
  },
  terrain: definition("terrain", "Рельеф", [{ domain: "terrain", required: true, minimumQuality: 0.5 }], true),
  "transit-accessibility": definition("transit-accessibility", "Транспортная доступность", [
    { domain: "road", required: true, minimumQuality: 0.5 },
    { domain: "transport_stop", required: true, minimumQuality: 0.5 },
  ], false),
  "elevation-analysis": definition("elevation-analysis", "Анализ высот и уклонов", [{ domain: "terrain", required: true, minimumQuality: 0.6 }], false),
  "functional-zoning": definition("functional-zoning", "Функциональное зонирование", [{ domain: "boundary", required: true, minimumQuality: 0.6 }], false),
  "sun-shadows": definition("sun-shadows", "Падающие тени", [buildingRequirement], false),
  noise: definition("noise", "Шумовое загрязнение", [{ domain: "road", required: true, minimumQuality: 0.6 }], false),
  wind: definition("wind", "Ветровой комфорт", [buildingRequirement], false),
  visibility: definition("visibility", "Видовые коридоры", [buildingRequirement], false),
  "social-infrastructure": definition("social-infrastructure", "Социальная инфраструктура", [{ domain: "poi", required: true, minimumQuality: 0.6 }], false),
  "pedestrian-accessibility": definition("pedestrian-accessibility", "Пешеходная доступность", [{ domain: "road", required: true, minimumQuality: 0.6 }], false),
  suitability: definition("suitability", "Пригодность для застройки", [
    buildingRequirement,
    { domain: "road", required: true, minimumQuality: 0.5 },
    { domain: "waterbody", required: false },
    { domain: "green_area", required: false },
  ], false),
};

export function getAnalysisDefinition(analysisId: string): AnalysisDefinition {
  const definition = ANALYSIS_REQUIREMENTS[analysisId];
  if (!definition) throw new Error(`Analysis "${analysisId}" is not registered.`);
  return definition;
}

function definition(
  id: string,
  title: string,
  requirements: AnalysisDataRequirement[],
  supportsDegradedMode: boolean
): AnalysisDefinition {
  return { id, title, requirements, supportsDegradedMode };
}
