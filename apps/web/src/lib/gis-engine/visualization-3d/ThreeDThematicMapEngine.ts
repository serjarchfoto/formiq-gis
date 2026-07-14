import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, LineString, Point, Polygon, Position } from "geojson";
import type {
  FormiqBuilding,
  FormiqBoundary,
  FormiqPoi,
  FormiqProjectData,
  FormiqRoad,
  FormiqTerrain,
  FormiqTerritory,
  FormiqTransitStop,
  FormiqVegetation,
  FormiqWater,
  ThreeDCallout,
  ThreeDMapDefinition,
  ThreeDMapLegendItem,
  ThreeDMapType,
} from "@/types/formiq";
import { clipFeatureCollectionToTerritory, getCoordinatesCentroid } from "@/lib/gis-engine/geometry/clipToTerritory";
import { isThematicMapDefinition, type ThematicMapDefinition } from "@/lib/gis-engine/thematic";

export interface ThreeDRenderableMap {
  definition: ThreeDMapDefinition;
  buildings: FeatureCollection<Polygon, GeoJsonProperties>;
  zones: FeatureCollection<Polygon, GeoJsonProperties>;
  routes: FeatureCollection<LineString, GeoJsonProperties>;
  poi: FeatureCollection<Point, GeoJsonProperties>;
  terrain: FeatureCollection<Point, GeoJsonProperties>;
  territoryBoundary: FeatureCollection<LineString, GeoJsonProperties>;
  terrainSummary: ThreeDTerrainSummary | null;
  callouts: ThreeDCallout[];
}

export interface ThreeDClippedDataset {
  buildings: FormiqBuilding[];
  roads: FormiqRoad[];
  vegetation: FormiqVegetation[];
  water: FormiqWater[];
  zones: Array<FormiqVegetation | FormiqWater | FormiqBoundary>;
  poi: FormiqPoi[];
  transitStops: FormiqTransitStop[];
  terrain: FormiqTerrain[];
  routes: FormiqRoad[];
}

export interface ThreeDTerrainSummary {
  enabled: boolean;
  source: string;
  sampleCount: number;
  minElevation: number;
  maxElevation: number;
  exaggeration: number;
}

const WHITE_MODEL_COLOR = "#F8FAFC";
const PRESENTATION_WHITE_MODEL_COLOR = "#F6F3EC";
const BUILDING_OUTLINE_COLOR = "#94A3B8";
const PRESENTATION_OUTLINE_COLOR = "#B8B2A8";
const UNKNOWN_COLOR = "#D6D7D9";

const THREE_D_MAP_DEFINITIONS: Record<ThreeDMapType, Omit<ThreeDMapDefinition, "legend">> = {
  "white-model": {
    id: "white-model",
    title: "Белая модель",
    description: "Светлая аксонометрия зданий без тематической окраски.",
    buildingColorMode: "white",
    zoneColorMode: "none",
    roadMode: "light",
    poiMode: "hidden",
    terrainMode: "flat",
  },
  "function-zoning": {
    id: "function-zoning",
    title: "Функциональное зонирование",
    description: "Здания и зоны окрашены по функции.",
    buildingColorMode: "function",
    zoneColorMode: "function",
    roadMode: "light",
    poiMode: "symbols",
    terrainMode: "flat",
  },
  floors: {
    id: "floors",
    title: "Этажность",
    description: "Аксонометрия зданий с окраской по этажности.",
    buildingColorMode: "floors",
    zoneColorMode: "none",
    roadMode: "light",
    poiMode: "symbols",
    terrainMode: "flat",
  },
  age: {
    id: "age",
    title: "Возраст зданий",
    description: "Аксонометрия зданий с окраской по возрасту.",
    buildingColorMode: "age",
    zoneColorMode: "none",
    roadMode: "light",
    poiMode: "symbols",
    terrainMode: "flat",
  },
  "mobility-routes": {
    id: "mobility-routes",
    title: "Маршруты людей и транспорта",
    description: "Цветные маршруты поверх модели.",
    buildingColorMode: "white",
    zoneColorMode: "none",
    roadMode: "mobility",
    poiMode: "callouts",
    terrainMode: "flat",
  },
  "green-water": {
    id: "green-water",
    title: "Озеленение и вода",
    description: "Зеленые и водные зоны поверх светлой 3D-модели.",
    buildingColorMode: "white",
    zoneColorMode: "green-water",
    roadMode: "light",
    poiMode: "symbols",
    terrainMode: "flat",
  },
  "presentation-mixed": {
    id: "presentation-mixed",
    title: "Смешанная презентационная схема",
    description: "Сбалансированная схема для экспорта: здания, зоны, маршруты и ключевые POI.",
    buildingColorMode: "function",
    zoneColorMode: "green-water",
    roadMode: "mobility",
    poiMode: "callouts",
    terrainMode: "points",
  },
};

const ROUTE_STYLES: Record<string, { label: string; color: string }> = {
  pedestrian: { label: "Пешеходный маршрут", color: "#16A34A" },
  car: { label: "Автомобильный маршрут", color: "#F97316" },
  public_transport: { label: "Общественный транспорт", color: "#2563EB" },
  service: { label: "Сервисный транспорт", color: "#64748B" },
  parking: { label: "Парковки", color: "#7C3AED" },
};

const POI_CATEGORIES = new Set([
  "parking",
  "bus_stop",
  "tram_stop",
  "station",
  "subway",
  "school",
  "education",
  "hospital",
  "healthcare",
  "public",
  "park",
]);

export class ThreeDThematicMapEngine {
  getDefinitions(): ThreeDMapDefinition[] {
    return Object.values(THREE_D_MAP_DEFINITIONS).map((definition) => ({
      ...definition,
      legend: [],
    }));
  }

  build(project: FormiqProjectData): ThreeDRenderableMap {
    const settings = project.settings.threeD;
    const terrainSettings = settings.terrain ?? {
      enabled: settings.showTerrain,
      source: "copernicus-dem" as const,
      mode: "flat" as const,
      exaggeration: 1,
      clipToTerritory: true,
      basePlaneElevation: "zero" as const,
    };
    const activeTerritory = getActiveTerritory(project);
    const clippedDataset = buildClippedThreeDDataset(project, activeTerritory);
    const terrainEnabled = settings.showTerrain && terrainSettings.enabled && terrainSettings.source !== "none";
    const terrainSamples = terrainEnabled ? clippedDataset.terrain : [];
    const presentation = settings.visualStyle === "presentation";
    const baseDefinition = THREE_D_MAP_DEFINITIONS[settings.activeMapType] ?? THREE_D_MAP_DEFINITIONS["white-model"];
    const buildingTheme = getBuildingTheme(project, baseDefinition.buildingColorMode);
    const buildings = settings.showBuildings
      ? clippedDataset.buildings.map((building) =>
          createBuildingFeature(
            building,
            buildingTheme,
            baseDefinition.buildingColorMode,
            settings.buildingHeightMultiplier,
            presentation,
            getBuildingBaseElevation(building, terrainSamples, terrainEnabled),
            terrainEnabled
          )
        )
      : [];
    const zones = settings.showZones
      ? createZoneFeatures(
          {
            ...clippedDataset,
            vegetation: settings.showVegetation === false ? [] : clippedDataset.vegetation,
            water: settings.showWater === false ? [] : clippedDataset.water,
          },
          baseDefinition.zoneColorMode,
          presentation
        )
      : [];
    const routes = settings.showRoads
      ? createRouteFeatures(clippedDataset.routes, baseDefinition.roadMode, settings.routeWidth, presentation)
      : [];
    const poi = settings.showPoi
      ? createPoiFeatures(clippedDataset.poi, clippedDataset.transitStops, settings.poiMode, presentation, settings.maxVisiblePoi)
      : [];
    const terrain =
      terrainEnabled && terrainSettings.mode !== "flat" && terrainSettings.mode !== "mesh"
        ? createTerrainFeatures(terrainSamples, terrainSettings.exaggeration)
        : [];
    const buildingsCollection = clipFeatureCollectionToTerritory(createFeatureCollection(buildings), activeTerritory?.geometry);
    const zonesCollection = clipFeatureCollectionToTerritory(createFeatureCollection(zones), activeTerritory?.geometry);
    const routesCollection = clipFeatureCollectionToTerritory(createFeatureCollection(routes), activeTerritory?.geometry);
    const poiCollection = clipFeatureCollectionToTerritory(createFeatureCollection(poi), activeTerritory?.geometry);
    const terrainCollection =
      terrainSettings.clipToTerritory
        ? clipFeatureCollectionToTerritory(createFeatureCollection(terrain), activeTerritory?.geometry)
        : createFeatureCollection(terrain);
    const callouts = createCallouts(poiCollection.features);
    const legend = createLegend(
      baseDefinition,
      buildingTheme,
      buildingsCollection.features,
      zonesCollection.features,
      routesCollection.features,
      poiCollection.features,
      terrainCollection.features,
      presentation
    );
    const territoryBoundary = settings.showTerritoryBoundary ? createTerritoryBoundary(activeTerritory) : [];
    const terrainSummary = createTerrainSummary(terrainSamples, terrainEnabled, terrainSettings.source, terrainSettings.exaggeration);

    return {
      definition: {
        ...baseDefinition,
        legend,
        poiMode: settings.poiMode === "hidden" ? "hidden" : baseDefinition.poiMode,
      },
      buildings: buildingsCollection,
      zones: zonesCollection,
      routes: routesCollection,
      poi: poiCollection,
      terrain: terrainCollection,
      territoryBoundary: createFeatureCollection(territoryBoundary),
      terrainSummary,
      callouts,
    };
  }
}

export function buildClippedThreeDDataset(
  project: FormiqProjectData,
  activeTerritory: FormiqTerritory | null
): ThreeDClippedDataset {
  if (!activeTerritory) {
    return {
      buildings: project.buildings,
      roads: project.roads,
      vegetation: project.vegetation,
      water: project.water,
      zones: [...project.vegetation, ...project.water, ...project.boundaries],
      poi: project.poi,
      transitStops: project.transitStops,
      terrain: project.terrain,
      routes: project.roads,
    };
  }

  return {
    buildings: filterEntitiesByTerritory(project.buildings, activeTerritory),
    roads: filterEntitiesByTerritory(project.roads, activeTerritory),
    vegetation: filterEntitiesByTerritory(project.vegetation, activeTerritory),
    water: filterEntitiesByTerritory(project.water, activeTerritory),
    zones: [
      ...filterEntitiesByTerritory(project.vegetation, activeTerritory),
      ...filterEntitiesByTerritory(project.water, activeTerritory),
      ...filterEntitiesByTerritory(project.boundaries, activeTerritory),
    ],
    poi: filterEntitiesByTerritory(project.poi, activeTerritory),
    transitStops: filterEntitiesByTerritory(project.transitStops, activeTerritory),
    terrain: filterEntitiesByTerritory(project.terrain, activeTerritory),
    routes: filterEntitiesByTerritory(project.roads, activeTerritory),
  };
}

export function getBuildingBaseElevation(
  building: FormiqBuilding,
  terrainSamples: FormiqTerrain[],
  terrainEnabled: boolean
): number {
  if (!terrainEnabled) {
    return 0;
  }

  if (typeof building.baseElevation === "number" && Number.isFinite(building.baseElevation)) {
    return building.baseElevation;
  }

  if (typeof building.threeD.baseElevation === "number" && Number.isFinite(building.threeD.baseElevation)) {
    return building.threeD.baseElevation;
  }

  if (!terrainSamples.length) {
    return 0;
  }

  const centroid = getCoordinatesCentroid(building.geometry.rings[0] ?? []);
  const nearest = terrainSamples.reduce<{ distance: number; elevation: number | null }>(
    (result, sample) => {
      if (sample.geometry.type !== "point") {
        return result;
      }

      const distance = getPlanarDistance(centroid, sample.geometry.coordinates);
      return distance < result.distance ? { distance, elevation: sample.elevation } : result;
    },
    { distance: Infinity, elevation: null }
  );

  return typeof nearest.elevation === "number" && Number.isFinite(nearest.elevation) ? nearest.elevation : 0;
}

function getActiveTerritory(project: FormiqProjectData): FormiqTerritory | null {
  return (
    project.territories.find((territory) => territory.id === project.activeTerritoryId) ??
    project.territories.find((territory) => territory.isActive) ??
    null
  );
}

function filterEntitiesByTerritory<TEntity extends { geometry: { type: string } }>(
  entities: TEntity[],
  territory: FormiqTerritory
): TEntity[] {
  return entities.filter((entity) => {
    const feature = formiqGeometryToFeature(entity.geometry);
    return feature ? clipFeatureCollectionToTerritory(createFeatureCollection([feature]), territory.geometry).features.length > 0 : false;
  });
}

function formiqGeometryToFeature(geometry: { type: string }): Feature<Geometry, GeoJsonProperties> | null {
  if (geometry.type === "point" && "coordinates" in geometry) {
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: geometry.coordinates as Position,
      },
    };
  }

  if (geometry.type === "line" && "coordinates" in geometry) {
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates as Position[],
      },
    };
  }

  if (geometry.type === "polygon" && "rings" in geometry) {
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: geometry.rings as Position[][],
      },
    };
  }

  return null;
}

function createTerritoryBoundary(territory: FormiqTerritory | null): Feature<LineString, GeoJsonProperties>[] {
  const ring = territory?.geometry.geometry.coordinates[0];

  if (!ring || ring.length < 2) {
    return [];
  }

  return [
    {
      type: "Feature",
      id: territory.id,
      properties: {
        id: territory.id,
        type: "territory-boundary",
        name: territory.name,
      },
      geometry: {
        type: "LineString",
        coordinates: ring,
      },
    },
  ];
}

function createTerrainSummary(
  terrainSamples: FormiqTerrain[],
  enabled: boolean,
  source: string,
  exaggeration: number
): ThreeDTerrainSummary | null {
  if (!enabled || !terrainSamples.length) {
    return null;
  }

  const elevations = terrainSamples
    .map((sample) => sample.elevation)
    .filter((elevation): elevation is number => typeof elevation === "number" && Number.isFinite(elevation));

  if (!elevations.length) {
    return null;
  }

  return {
    enabled,
    source,
    sampleCount: elevations.length,
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
    exaggeration,
  };
}

function getPlanarDistance(a: Position, b: Position): number {
  const lng = a[0] - b[0];
  const lat = a[1] - b[1];
  return lng * lng + lat * lat;
}

function getBuildingTheme(
  project: FormiqProjectData,
  mode: ThreeDMapDefinition["buildingColorMode"]
): ThematicMapDefinition | null {
  const themeId = mode === "function" ? "function" : mode === "floors" ? "floors" : mode === "age" ? "age" : "none";
  const theme = project.thematicMaps[themeId];

  return isThematicMapDefinition(theme) ? theme : null;
}

function createBuildingFeature(
  building: FormiqBuilding,
  theme: ThematicMapDefinition | null,
  mode: ThreeDMapDefinition["buildingColorMode"],
  heightMultiplier: number,
  presentation: boolean,
  baseElevation: number,
  terrainEnabled: boolean
): Feature<Polygon, GeoJsonProperties> {
  const themedFeature = theme?.geojson.features.find((feature) => String(feature.id) === building.id);
  const category = String(themedFeature?.properties?.category ?? getBuildingCategory(building, mode));
  const semanticColor = themedFeature?.properties?.renderColor;
  const renderColor =
    mode === "white"
      ? presentation
        ? PRESENTATION_WHITE_MODEL_COLOR
        : WHITE_MODEL_COLOR
      : presentation
        ? fallbackBuildingColor(building, mode, category, true)
        : typeof semanticColor === "string"
          ? semanticColor
          : fallbackBuildingColor(building, mode, category, false);
  const rawHeight = building.height ?? building.absoluteHeight ?? building.heightFromLevels ?? building.threeD.whiteModel.extrusionHeight ?? 8;
  const renderHeight = Math.max(2, rawHeight * heightMultiplier);

  return {
    type: "Feature",
    id: building.id,
    geometry: {
      type: "Polygon",
      coordinates: building.geometry.rings,
    },
    properties: {
      id: building.id,
      type: "building",
      category,
      renderColor,
      outlineColor: presentation ? PRESENTATION_OUTLINE_COLOR : BUILDING_OUTLINE_COLOR,
      renderHeight,
      heightLabel: `${Math.round(renderHeight)} м`,
      extrusionHeight: renderHeight,
      baseElevation: 0,
      groundElevation: baseElevation,
      terrainAdjusted: terrainEnabled,
      levels: building.levels,
      usage: building.usage,
      year: building.year,
    },
  };
}

function createZoneFeatures(
  dataset: ThreeDClippedDataset,
  mode: ThreeDMapDefinition["zoneColorMode"],
  presentation: boolean
): Feature<Polygon, GeoJsonProperties>[] {
  if (mode === "none") {
    return [];
  }

  return [
    ...dataset.vegetation.map((feature) => createVegetationZone(feature, presentation)),
    ...dataset.water.map((feature) => createWaterZone(feature, presentation)),
  ];
}

function createVegetationZone(vegetation: FormiqVegetation, presentation: boolean): Feature<Polygon, GeoJsonProperties> {
  return {
    type: "Feature",
    id: vegetation.id,
    geometry: {
      type: "Polygon",
      coordinates: vegetation.geometry.rings,
    },
    properties: {
      id: vegetation.id,
      type: "zone",
      category: vegetation.semantic.landscapeCategory,
      renderColor: presentation ? "#CDE7C7" : "#86EFAC",
      outlineColor: presentation ? "#8AB889" : "#22C55E",
    },
  };
}

function createWaterZone(water: FormiqWater, presentation: boolean): Feature<Polygon, GeoJsonProperties> {
  return {
    type: "Feature",
    id: water.id,
    geometry: {
      type: "Polygon",
      coordinates: water.geometry.rings,
    },
    properties: {
      id: water.id,
      type: "zone",
      category: water.waterType ?? "water",
      renderColor: presentation ? "#B9DAE8" : "#7DD3FC",
      outlineColor: presentation ? "#76A7BC" : "#0284C7",
    },
  };
}

function createRouteFeatures(
  roads: FormiqRoad[],
  mode: ThreeDMapDefinition["roadMode"],
  routeWidth: number,
  presentation: boolean
): Feature<LineString, GeoJsonProperties>[] {
  if (mode === "hidden") {
    return [];
  }

  return roads.map((road) => {
    const routeType = mode === "mobility" ? classifyRoute(road) : "service";
    const routeStyle = ROUTE_STYLES[routeType] ?? ROUTE_STYLES.service;
    const roadStyle = getPresentationRoadStyle(road);

    return {
      type: "Feature",
      id: road.id,
      geometry: {
        type: "LineString",
        coordinates: road.geometry.coordinates,
      },
      properties: {
        id: road.id,
        type: "route",
        routeType,
        roadClass: roadStyle.id,
        renderColor: mode === "light" ? roadStyle.color : presentation ? softenRouteColor(routeType, routeStyle.color) : routeStyle.color,
        routeWidth: mode === "light" ? roadStyle.width : routeWidth,
        length: road.length,
      },
    };
  });
}

function createPoiFeatures(
  poi: FormiqPoi[],
  transitStops: FormiqTransitStop[],
  poiMode: ThreeDMapDefinition["poiMode"],
  presentation: boolean,
  maxVisiblePoi: number
): Feature<Point, GeoJsonProperties>[] {
  if (poiMode === "hidden") {
    return [];
  }

  const candidates = [
    ...transitStops.map((item) => createTransitStopFeature(item, poiMode, presentation)),
    ...poi.filter(isImportantPoi).map((item) => createPoiFeature(item, poiMode, presentation)),
  ];

  return presentation ? candidates.slice(0, Math.max(0, maxVisiblePoi)) : candidates;
}

function createTerrainFeatures(terrain: FormiqTerrain[], exaggeration: number): Feature<Point, GeoJsonProperties>[] {
  return terrain
    .filter((item) => item.geometry.type === "point")
    .map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: {
        type: "Point",
        coordinates: item.geometry.type === "point" ? item.geometry.coordinates : [0, 0],
      },
      properties: {
        id: item.id,
        type: "terrain",
        elevation: item.elevation,
        renderElevation: (item.elevation ?? 0) * exaggeration,
        renderColor: "#A7F3D0",
      },
    }));
}

function createPoiFeature(
  poi: FormiqPoi,
  poiMode: ThreeDMapDefinition["poiMode"],
  presentation: boolean
): Feature<Point, GeoJsonProperties> {
  return {
    type: "Feature",
    id: poi.id,
    geometry: {
      type: "Point",
      coordinates: getPointCoordinate(poi.geometry),
    },
    properties: {
      id: poi.id,
      type: "poi",
      category: poi.category,
      label: poi.name ?? poi.subtype ?? poi.category,
      iconId: getPoiIconId(poi.category, poi.subtype),
      renderColor: presentation ? "#B86B38" : "#F97316",
      callout: poiMode === "callouts",
    },
  };
}

function createTransitStopFeature(
  stop: FormiqTransitStop,
  poiMode: ThreeDMapDefinition["poiMode"],
  presentation: boolean
): Feature<Point, GeoJsonProperties> {
  return {
    type: "Feature",
    id: stop.id,
    geometry: {
      type: "Point",
      coordinates: stop.geometry.coordinates,
    },
    properties: {
      id: stop.id,
      type: "poi",
      category: "bus_stop",
      label: stop.name ?? "Остановка",
      iconId: "transit-stop",
      renderColor: presentation ? "#5A78A8" : "#2563EB",
      callout: poiMode === "callouts",
    },
  };
}

function createCallouts(points: Feature<Point, GeoJsonProperties>[]): ThreeDCallout[] {
  return points.map((feature) => ({
    id: `${feature.id ?? feature.properties?.id}-callout`,
    iconId: String(feature.properties?.iconId ?? "poi"),
    label: String(feature.properties?.label ?? feature.properties?.category ?? "POI"),
    coordinate: feature.geometry.coordinates as [number, number],
    targetFeatureId: String(feature.properties?.id ?? feature.id ?? ""),
    category: String(feature.properties?.category ?? "poi"),
    visible: Boolean(feature.properties?.callout),
  }));
}

function createLegend(
  definition: Omit<ThreeDMapDefinition, "legend">,
  buildingTheme: ThematicMapDefinition | null,
  buildings: Feature<Polygon, GeoJsonProperties>[],
  zones: Feature<Polygon, GeoJsonProperties>[],
  routes: Feature<LineString, GeoJsonProperties>[],
  poi: Feature<Point, GeoJsonProperties>[],
  terrain: Feature<Point, GeoJsonProperties>[],
  presentation: boolean
): ThreeDMapLegendItem[] {
  const items: ThreeDMapLegendItem[] = [];

  if (definition.buildingColorMode === "white") {
    items.push({
      id: "white-buildings",
      label: "Белая модель зданий",
      color: presentation ? PRESENTATION_WHITE_MODEL_COLOR : WHITE_MODEL_COLOR,
      count: buildings.length,
    });
  } else if (presentation) {
    addGroupedLegendItems(items, buildings, "buildings");
  } else if (buildingTheme) {
    items.push(
      ...buildingTheme.legend.map((item) => ({
        id: item.key,
        label: item.label,
        color: item.color,
        count: item.count,
      }))
    );
  } else {
    items.push({ id: "unknown-buildings", label: "Здания без категории", color: UNKNOWN_COLOR });
  }

  addGroupedLegendItems(items, zones, "zones");
  addGroupedLegendItems(items, routes, "routes");
  addGroupedLegendItems(items, poi, "poi");

  if (terrain.length) {
    items.push({ id: "terrain", label: "Точки рельефа", color: "#A7F3D0", count: terrain.length });
  }

  return items;
}

function addGroupedLegendItems(
  items: ThreeDMapLegendItem[],
  features: Feature<Geometry, GeoJsonProperties>[],
  prefix: string
): void {
  const grouped = new Map<string, ThreeDMapLegendItem>();

  features.forEach((feature) => {
    const id = String(feature.properties?.roadClass ?? feature.properties?.routeType ?? feature.properties?.category ?? feature.properties?.type ?? "unknown");
    const routeLabel = ROUTE_STYLES[id]?.label;
    const label = routeLabel ?? formatLegendLabel(id);
    const color = String(feature.properties?.renderColor ?? UNKNOWN_COLOR);
    const existing = grouped.get(id);

    grouped.set(id, {
      id: `${prefix}:${id}`,
      label,
      color,
      count: (existing?.count ?? 0) + 1,
      length: (existing?.length ?? 0) + toFiniteNumber(feature.properties?.length),
    });
  });

  items.push(...grouped.values());
}

function classifyRoute(road: FormiqRoad): string {
  if (road.roadType === "footway" || road.roadType === "pedestrian" || road.semantic.transportCategory === "pedestrian") {
    return "pedestrian";
  }

  if (road.semantic.transportCategory === "city" || road.semantic.transportCategory === "regional") {
    return "public_transport";
  }

  if (road.roadType === "service" || road.semantic.transportCategory === "service") {
    return "service";
  }

  if (road.tags.parking || road.tags.amenity === "parking") {
    return "parking";
  }

  return "car";
}

function fallbackBuildingColor(
  building: FormiqBuilding,
  mode: ThreeDMapDefinition["buildingColorMode"],
  category: string,
  presentation: boolean
): string {
  if (mode === "function") {
    return (presentation ? presentationFunctionColors : functionColors)[category || building.semantic.functionCategory] ?? UNKNOWN_COLOR;
  }

  if (mode === "age") {
    return (presentation ? presentationAgeColors : ageColors)[category || building.semantic.ageCategory] ?? UNKNOWN_COLOR;
  }

  if (mode === "floors") {
    return (presentation ? presentationFloorColors : floorColors)[category || building.semantic.heightCategory] ?? UNKNOWN_COLOR;
  }

  return presentation ? PRESENTATION_WHITE_MODEL_COLOR : WHITE_MODEL_COLOR;
}

function getBuildingCategory(building: FormiqBuilding, mode: ThreeDMapDefinition["buildingColorMode"]): string {
  if (mode === "function") return building.semantic.functionCategory;
  if (mode === "age") return building.semantic.ageCategory;
  if (mode === "floors") return building.semantic.heightCategory;
  return "white-model";
}

function isImportantPoi(poi: FormiqPoi): boolean {
  return POI_CATEGORIES.has(poi.category) || (poi.subtype ? POI_CATEGORIES.has(poi.subtype) : false);
}

function getPresentationRoadStyle(road: FormiqRoad): { id: string; color: string; width: number } {
  if (road.roadType === "primary" || road.roadType === "secondary" || road.roadType === "tertiary") {
    return { id: "major-road", color: "#9CA3AF", width: 2.2 };
  }

  if (road.roadType === "footway" || road.roadType === "pedestrian" || road.roadType === "cycleway") {
    return { id: "pedestrian-road", color: "#D6D3CD", width: 1 };
  }

  if (road.roadType === "service") {
    return { id: "service-road", color: "#C8C3BA", width: 1.2 };
  }

  return { id: "local-road", color: "#BFC5CC", width: 1.6 };
}

function softenRouteColor(routeType: string, fallback: string): string {
  const colors: Record<string, string> = {
    pedestrian: "#5FAF75",
    car: "#C98A4C",
    public_transport: "#5A78A8",
    service: "#8C9299",
    parking: "#8B76B2",
  };

  return colors[routeType] ?? fallback;
}

function getPointCoordinate(geometry: FormiqPoi["geometry"]): [number, number] {
  if (geometry.type === "point") {
    return geometry.coordinates as [number, number];
  }

  const ring = geometry.rings[0] ?? [];
  const [sumLng, sumLat] = ring.reduce(
    ([lng, lat], coordinate) => [lng + coordinate[0], lat + coordinate[1]],
    [0, 0]
  );
  const count = Math.max(1, ring.length);

  return [sumLng / count, sumLat / count];
}

function getPoiIconId(category: string, subtype: string | null): string {
  if (category === "parking") return "parking";
  if (category === "education" || subtype === "school") return "school";
  if (category === "healthcare" || subtype === "hospital") return "hospital";
  if (category === "park" || subtype === "park") return "park";
  return "poi";
}

function formatLegendLabel(value: string): string {
  const labels: Record<string, string> = {
    pedestrian: "Пешеходный маршрут",
    car: "Автомобильный маршрут",
    public_transport: "Общественный транспорт",
    service: "Сервисный транспорт",
    parking: "Парковки",
    "major-road": "Магистральные дороги",
    "local-road": "Локальные дороги",
    "pedestrian-road": "Пешеходные связи",
    "service-road": "Сервисные дороги",
    residential: "Жилая",
    commercial: "Коммерческая",
    industrial: "Производственная",
    public: "Общественная",
    education: "Образование",
    healthcare: "Медицина",
    religious: "Религия",
    sports: "Спорт",
    mixed: "Смешанная",
    low: "Низкая этажность",
    mid: "Средняя этажность",
    high: "Высотная застройка",
    "very-high": "Башни",
    "historic-pre-1917": "До 1917",
    "soviet-early": "1917-1945",
    "soviet-mid": "1945-1970",
    "soviet-late": "1970-1990",
    "post-soviet": "1990-2010",
    contemporary: "После 2010",
    park: "Зеленая зона",
    forest: "Лес",
    grass: "Газоны",
    garden: "Сад",
    recreation: "Рекреация",
    water: "Вода",
    river: "Река",
    lake: "Озеро",
    pond: "Пруд",
    poi: "POI",
    bus_stop: "Остановки",
    unknown: "Неизвестно",
  };

  return labels[value] ?? value;
}

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createFeatureCollection<TGeometry extends Geometry>(
  features: Feature<TGeometry, GeoJsonProperties>[]
): FeatureCollection<TGeometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features,
  };
}

const functionColors: Record<string, string> = {
  residential: "#60A5FA",
  commercial: "#F59E0B",
  industrial: "#6B7280",
  public: "#A855F7",
  education: "#22C55E",
  healthcare: "#EF4444",
  religious: "#8B5CF6",
  sports: "#14B8A6",
  mixed: "#A855F7",
  unknown: UNKNOWN_COLOR,
};

const floorColors: Record<string, string> = {
  low: "#93C5FD",
  mid: "#3B82F6",
  high: "#1D4ED8",
  "very-high": "#1E3A8A",
  unknown: UNKNOWN_COLOR,
};

const ageColors: Record<string, string> = {
  "historic-pre-1917": "#92400E",
  "soviet-early": "#B45309",
  "soviet-mid": "#D97706",
  "soviet-late": "#F59E0B",
  "post-soviet": "#FBBF24",
  contemporary: "#FCD34D",
  unknown: UNKNOWN_COLOR,
};

const presentationFunctionColors: Record<string, string> = {
  residential: "#A9C7DF",
  commercial: "#D6A56E",
  industrial: "#A9ADB2",
  public: "#C2B0D6",
  education: "#A8D0A8",
  healthcare: "#D99A95",
  religious: "#B7A1C8",
  sports: "#9ECAC2",
  mixed: "#C2B0D6",
  unknown: UNKNOWN_COLOR,
};

const presentationFloorColors: Record<string, string> = {
  low: "#EFE3D1",
  mid: "#E3B17B",
  high: "#B96C5F",
  "very-high": "#765247",
  unknown: UNKNOWN_COLOR,
};

const presentationAgeColors: Record<string, string> = {
  "historic-pre-1917": "#8C6A52",
  "soviet-early": "#B8795F",
  "soviet-mid": "#D99A5E",
  "soviet-late": "#E7C56F",
  "post-soviet": "#EAD8A9",
  contemporary: "#EFE3D1",
  unknown: UNKNOWN_COLOR,
};
