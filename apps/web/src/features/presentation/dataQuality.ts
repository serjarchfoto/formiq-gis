import type { FormiqBuilding, FormiqProjectData } from "@/types/formiq";
import type { PresentationMapPresetId } from "./presets";
import { resolveProjectPresentationData } from "./resolvedData";

export type PresentationDataStatus = "measured" | "modelled" | "partial" | "unavailable";
export type PresentationReadiness = "ready" | "partial" | "no-data" | "unsupported";

export interface PresentationDataRequirement {
  fields: string[];
  source: string;
  sourceId?: string;
  canAutoLoad: boolean;
  unlocks: string[];
}

export interface PresentationDataAudit {
  status: PresentationDataStatus;
  readiness: PresentationReadiness;
  statusLabel: string;
  summary: string;
  knownCount: number;
  totalCount: number;
  coveragePercent: number;
  units: string;
  sources: string[];
}

/** Backward-compatible project view for existing analysis consumers. */
export function resolvePresentationProject(project: FormiqProjectData): FormiqProjectData {
  return resolveProjectPresentationData(project).project;
}

const requirements: Record<PresentationMapPresetId, PresentationDataRequirement> = {
  "population-grid": {
    fields: ["population", "residents"],
    source: "Wikidata / OSM",
    sourceId: "wikidata",
    canAutoLoad: true,
    unlocks: ["Плотность населения", "GRID", "Heatmap"],
  },
  "transit-access": {
    fields: ["transit-stop", "public_transport"],
    source: "OSM / Overpass",
    sourceId: "osm",
    canAutoLoad: true,
    unlocks: ["Доступность транспорта", "Остановки", "Радиусы 300 м"],
  },
  "population-heatmap": {
    fields: ["population", "residents"],
    source: "Wikidata / OSM",
    sourceId: "wikidata",
    canAutoLoad: true,
    unlocks: ["Плотность населения", "Heatmap", "Сравнение сценариев"],
  },
  "terrain-height": {
    fields: ["elevation"],
    source: "Copernicus DEM / SRTM",
    sourceId: "copernicus-dem",
    canAutoLoad: true,
    unlocks: ["Высота рельефа", "Уклоны", "Аксонометрия"],
  },
  "building-floors": {
    fields: ["building:levels", "height"],
    source: "OSM / Microsoft Buildings",
    sourceId: "osm",
    canAutoLoad: true,
    unlocks: ["Этажность", "Объёмная модель", "Тени"],
  },
  "building-age": {
    fields: ["start_date", "building:year", "year"],
    source: "OSM / Wikidata",
    sourceId: "osm",
    canAutoLoad: true,
    unlocks: ["Возраст зданий", "Исторические слои", "Хронология"],
  },
  "functional-zoning": {
    fields: ["building", "amenity", "shop", "office"],
    source: "OSM / City GeoJSON",
    sourceId: "osm",
    canAutoLoad: true,
    unlocks: ["Функции зданий", "Зонирование", "Легенда функций"],
  },
  "axonometric-zoning": {
    fields: ["height", "building:levels", "elevation"],
    source: "OSM / Copernicus DEM",
    sourceId: "copernicus-dem",
    canAutoLoad: true,
    unlocks: ["Аксонометрия", "Рельеф", "Объёмная модель"],
  },
  "shadow-analysis": {
    fields: ["height", "building:levels", "date", "time"],
    source: "OSM + солнечная модель",
    sourceId: "osm",
    canAutoLoad: false,
    unlocks: ["Инсоляция", "Тени", "Продолжительность освещения"],
  },
};

export function getPresentationDataRequirement(presetId: PresentationMapPresetId): PresentationDataRequirement {
  return requirements[presetId];
}

export function auditPresentationMap(project: FormiqProjectData, presetId: PresentationMapPresetId): PresentationDataAudit {
  if (presetId === "population-grid" || presetId === "population-heatmap") {
    const known = project.buildings.filter((building) => getBuildingPopulation(building) !== null);
    return coverageAudit({
      knownCount: known.length,
      totalCount: project.buildings.length,
      units: "человек",
      sources: getSources(known),
      measuredSummary: "Население агрегировано только из явных атрибутов population/residents.",
      unavailableSummary: "В проекте нет атрибутов населения. Плотность населения рассчитать нельзя.",
    });
  }

  if (presetId === "transit-access") {
    const stops = project.transitStops;
    return stops.length > 0
      ? createAudit("modelled", stops.length, stops.length, "метры", getSources(stops), "Показана радиусная доступность 300 м по прямой. Это не расчёт по пешеходному графу.")
      : createAudit("unavailable", 0, 0, "метры", [], "В проекте нет объектов типа transit-stop; POI не используются как подмена остановок.");
  }

  if (presetId === "terrain-height") {
    const terrain = project.terrain.filter((item) => isKnownPositiveOrNegative(item.elevation));
    return terrain.length > 0
      ? createAudit("measured", terrain.length, project.terrain.length, "метры", getSources(terrain), "Высоты построены только по точкам с числовым elevation; между точками показана интерполяция.")
      : createAudit("unavailable", 0, project.terrain.length, "метры", [], "В проекте нет числовых отметок elevation. Градиент рельефа не строится.");
  }

  if (presetId === "building-floors") {
    const buildings = project.buildings.filter((building) => isKnownPositive(building.levels));
    return coverageAudit({ knownCount: buildings.length, totalCount: project.buildings.length, units: "этажи", sources: getSources(buildings), measuredSummary: "Этажность взята из building:levels или объединённых атрибутов источников.", unavailableSummary: "Нет зданий с известной этажностью." });
  }

  if (presetId === "building-age") {
    const buildings = project.buildings.filter((building) => isKnownYear(building.year));
    return coverageAudit({ knownCount: buildings.length, totalCount: project.buildings.length, units: "год", sources: getSources(buildings), measuredSummary: "Возраст основан только на валидных значениях start_date/year.", unavailableSummary: "Нет зданий с известным годом строительства." });
  }

  if (presetId === "functional-zoning") {
    const buildings = project.buildings.filter((building) => building.semantic.functionCategory !== "unknown");
    return coverageAudit({ knownCount: buildings.length, totalCount: project.buildings.length, units: "категория", sources: getSources(buildings), measuredSummary: "Функции получены из явных тегов назначения и семантической нормализации.", unavailableSummary: "Нет зданий с определённой функцией." });
  }

  if (presetId === "axonometric-zoning") {
    const buildings = project.buildings.filter(hasKnownBuildingHeight);
    return coverageAudit({ knownCount: buildings.length, totalCount: project.buildings.length, units: "метры", sources: getSources(buildings), measuredSummary: "Высота объёмов основана на height или building:levels; неизвестные объекты остаются плоскими.", unavailableSummary: "Нет высот или этажности для построения объёмов." });
  }

  return createAudit("unavailable", 0, project.buildings.length, "часы", [], "Расчёт теней требует даты, времени, координат солнца и высот зданий. Эти параметры в проекте не заданы.");
}

export function getBuildingPopulation(building: FormiqBuilding): number | null {
  for (const key of ["population", "residents"] as const) {
    const rawValue = building.tags[key];
    if (typeof rawValue !== "string" || rawValue.trim() === "") continue;
    const value = Number(rawValue.replace(",", "."));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function hasKnownBuildingHeight(building: FormiqBuilding): boolean {
  return isKnownPositive(building.relativeHeight) || isKnownPositive(building.height) || isKnownPositive(building.levels);
}

function coverageAudit({ knownCount, totalCount, units, sources, measuredSummary, unavailableSummary }: { knownCount: number; totalCount: number; units: string; sources: string[]; measuredSummary: string; unavailableSummary: string }): PresentationDataAudit {
  if (knownCount === 0) return createAudit("unavailable", knownCount, totalCount, units, sources, unavailableSummary);
  const coverage = totalCount > 0 ? knownCount / totalCount : 0;
  return createAudit(coverage >= 0.9 ? "measured" : "partial", knownCount, totalCount, units, sources, coverage >= 0.9 ? measuredSummary : `${measuredSummary} Заполнено только ${Math.round(coverage * 100)}% объектов.`);
}

function createAudit(status: PresentationDataStatus, knownCount: number, totalCount: number, units: string, sources: string[], summary: string): PresentationDataAudit {
  const labels: Record<PresentationDataStatus, string> = { measured: "Данные подтверждены", modelled: "Расчётная модель", partial: "Неполные данные", unavailable: "Недостаточно данных" };
  const readiness: PresentationReadiness = status === "unavailable" ? "no-data" : status === "partial" ? "partial" : "ready";
  return { status, readiness, statusLabel: labels[status], summary, knownCount, totalCount, coveragePercent: totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0, units, sources };
}

function getSources(entities: Array<{ source: string }>): string[] {
  return Array.from(new Set(entities.map((entity) => entity.source).filter((source) => source !== "unknown")));
}

function isKnownPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isKnownPositiveOrNegative(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isKnownYear(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= new Date().getFullYear() + 1;
}
