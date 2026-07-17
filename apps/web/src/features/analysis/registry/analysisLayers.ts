import type { AnalysisLayerDefinition, AnalysisMetricDefinition } from "./types";

const far: AnalysisMetricDefinition = {
  id: "far",
  title: "FAR",
  description: "Отношение общей площади этажей к площади территории.",
  source: "model.far",
  format: "decimal",
  range: { min: 0, max: 4 },
  quality: "derived",
};

const gsi: AnalysisMetricDefinition = {
  id: "gsi",
  title: "GSI",
  description: "Доля территории, занятая пятном застройки.",
  source: "model.gsi",
  format: "decimal",
  range: { min: 0, max: 1 },
  quality: "derived",
};

const bcr: AnalysisMetricDefinition = {
  id: "bcr",
  title: "BCR",
  description: "Коэффициент покрытия территории зданиями.",
  source: "model.bcr",
  format: "decimal",
  range: { min: 0, max: 1 },
  quality: "derived",
};

const floors: AnalysisMetricDefinition = {
  id: "floors",
  title: "Средняя этажность",
  description: "Среднее значение по зданиям с известной этажностью.",
  source: "model.floors",
  format: "decimal",
  unit: "эт.",
  range: { min: 0, max: 30 },
  quality: "derived",
};

const buildingCount: AnalysisMetricDefinition = {
  id: "building-count",
  title: "Здания",
  description: "Количество зданий в проектной модели.",
  source: "analysis.building-count",
  format: "number",
  unit: "объектов",
  quality: "verified",
};

const maxFloors: AnalysisMetricDefinition = {
  id: "max-floors",
  title: "Максимальная этажность",
  description: "Максимум по зданиям с известной этажностью.",
  source: "analysis.max-floors",
  format: "number",
  unit: "эт.",
  range: { min: 0, max: 50 },
  quality: "derived",
};

const roadLength: AnalysisMetricDefinition = {
  id: "road-length",
  title: "Длина сети",
  description: "Суммарная длина импортированных дорог.",
  source: "analysis.road-length",
  format: "length",
  quality: "derived",
};

const roadDensity: AnalysisMetricDefinition = {
  id: "road-density",
  title: "Плотность сети",
  description: "Длина дорожной сети на площадь территории.",
  source: "analysis.road-density",
  format: "decimal",
  unit: "м/км²",
  quality: "derived",
};

const greenArea: AnalysisMetricDefinition = {
  id: "green-area",
  title: "Площадь озеленения",
  description: "Площадь импортированных зелёных территорий.",
  source: "analysis.green-area",
  format: "area",
  quality: "derived",
};

const greenShare: AnalysisMetricDefinition = {
  id: "green-share",
  title: "Доля озеленения",
  description: "Доля зелёных территорий в границах анализа.",
  source: "analysis.green-share",
  format: "percent",
  unit: "%",
  range: { min: 0, max: 100 },
  quality: "derived",
};

const waterArea: AnalysisMetricDefinition = {
  id: "water-area",
  title: "Площадь воды",
  description: "Площадь импортированных водных объектов.",
  source: "analysis.water-area",
  format: "area",
  quality: "derived",
};

const waterShare: AnalysisMetricDefinition = {
  id: "water-share",
  title: "Доля воды",
  description: "Доля водных объектов в границах анализа.",
  source: "analysis.water-share",
  format: "percent",
  unit: "%",
  range: { min: 0, max: 100 },
  quality: "derived",
};

const poiCount: AnalysisMetricDefinition = {
  id: "poi-count",
  title: "Объекты сервиса",
  description: "Количество импортированных POI.",
  source: "analysis.poi-count",
  format: "number",
  unit: "объектов",
  quality: "verified",
};

const transitCount: AnalysisMetricDefinition = {
  id: "transit-count",
  title: "Остановки",
  description: "Количество импортированных остановок.",
  source: "analysis.transit-count",
  format: "number",
  unit: "объектов",
  quality: "verified",
};

const terrainSamples: AnalysisMetricDefinition = {
  id: "terrain-samples",
  title: "Точки высот",
  description: "Количество доступных точек цифровой модели рельефа.",
  source: "analysis.terrain-samples",
  format: "number",
  unit: "точек",
  quality: "derived",
};

export const analysisLayers = [
  {
    id: "floor-count",
    title: "Этажность застройки",
    shortTitle: "Этажность",
    description: "Классификация зданий по количеству этажей.",
    category: "buildings",
    status: "partial",
    navigationGroup: "ready",
    icon: "building",
    thematicMapType: "floors",
    calculatorId: "buildings",
    visualization: { type: "extrusion", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [floors, maxFloors, buildingCount, far, gsi],
    filters: [{ id: "floor-category", title: "Категория этажности", type: "multi-select", options: [
      { value: "low", label: "1–3 этажа" }, { value: "mid", label: "4–8 этажей" },
      { value: "high", label: "9–20 этажей" }, { value: "very-high", label: "20+ этажей" },
      { value: "unknown", label: "Неизвестно" },
    ] }],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqBuilding.levels/height", quality: "derived", description: "Неполные исходные атрибуты остаются в категории unknown." },
  },
  {
    id: "building-age",
    title: "Возраст зданий",
    shortTitle: "Возраст",
    description: "Периодизация зданий по известному году постройки.",
    category: "buildings",
    status: "partial",
    navigationGroup: "ready",
    icon: "building",
    thematicMapType: "age",
    calculatorId: "buildings",
    visualization: { type: "fill", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [buildingCount, floors, far, gsi],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqBuilding.year", quality: "derived", description: "Полнота зависит от year/start_date; отсутствие года не интерполируется." },
  },
  {
    id: "building-function",
    title: "Функции зданий",
    shortTitle: "Функции",
    description: "Классификация зданий по нормализованному назначению.",
    category: "planning",
    status: "partial",
    navigationGroup: "ready",
    icon: "grid",
    thematicMapType: "function",
    calculatorId: "buildings",
    visualization: { type: "fill", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [buildingCount, far, gsi, bcr],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqBuilding.usage", quality: "derived", description: "Это функции зданий, а не юридическое функциональное зонирование территории." },
  },
  {
    id: "built-density",
    title: "Плотность застройки",
    shortTitle: "Плотность",
    description: "Плотность пятна застройки; FAR и GSI представлены как показатели этого режима.",
    category: "buildings",
    status: "derived",
    navigationGroup: "ready",
    icon: "blocks",
    thematicMapType: "density",
    calculatorId: "buildings",
    visualization: { type: "fill", supports2D: true, supports3D: true, supportsComparison: true, supportsScenarios: true },
    metrics: [far, gsi, bcr, floors, buildingCount],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "Геометрия зданий и территория", quality: "derived", description: "Тематическая карта классифицирует размер пятна, а не население." },
  },
  {
    id: "roads",
    title: "Дорожная сеть",
    shortTitle: "Дороги",
    description: "Классы и протяжённость импортированной дорожной сети.",
    category: "mobility",
    status: "derived",
    navigationGroup: "ready",
    icon: "transport",
    thematicMapType: "roads",
    calculatorId: "roads",
    visualization: { type: "line", supports2D: true, supports3D: false, supportsComparison: false, supportsScenarios: false },
    metrics: [roadLength, roadDensity],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqRoad", quality: "derived" },
  },
  {
    id: "greenery",
    title: "Озеленение",
    shortTitle: "Зелень",
    description: "Типы и площадь импортированных зелёных территорий.",
    category: "landscape",
    status: "derived",
    navigationGroup: "ready",
    icon: "layers",
    thematicMapType: "vegetation",
    calculatorId: "vegetation",
    visualization: { type: "fill", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [greenShare, greenArea],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqVegetation", quality: "derived" },
  },
  {
    id: "water",
    title: "Водные объекты",
    shortTitle: "Вода",
    description: "Типы и площадь импортированных водных объектов.",
    category: "landscape",
    status: "derived",
    navigationGroup: "ready",
    icon: "map",
    thematicMapType: "water",
    calculatorId: "water",
    visualization: { type: "fill", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [waterShare, waterArea],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqWater", quality: "derived" },
  },
  {
    id: "poi-transit",
    title: "POI и остановки",
    shortTitle: "Объекты",
    description: "Точки сервисов и остановок без расчёта пешеходных изохрон.",
    category: "mobility",
    status: "partial",
    navigationGroup: "ready",
    icon: "transport",
    thematicMapType: "accessibility",
    calculatorId: "accessibility",
    visualization: { type: "symbol", supports2D: true, supports3D: false, supportsComparison: false, supportsScenarios: false },
    metrics: [transitCount, poiCount],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqPoi и FormiqTransitStop", quality: "derived", description: "Наличие точек не означает рассчитанную транспортную доступность." },
  },
  {
    id: "terrain",
    title: "Рельеф",
    shortTitle: "Рельеф",
    description: "Доступные точки высот; классификация уклонов пока неполная.",
    category: "landscape",
    status: "partial",
    navigationGroup: "ready",
    icon: "map",
    thematicMapType: "terrain",
    calculatorId: "terrain",
    visualization: { type: "symbol", supports2D: true, supports3D: true, supportsComparison: false, supportsScenarios: false },
    metrics: [terrainSamples],
    filters: [],
    legend: { source: "thematic-map" },
    provenance: { source: "FormiqTerrain / DEM", quality: "derived", description: "Текущий TerrainSemanticAnalyzer не классифицирует уклон и высоту." },
  },
  ...createReservedLayers(),
] as const satisfies ReadonlyArray<AnalysisLayerDefinition>;

function createReservedLayers(): AnalysisLayerDefinition[] {
  const reserved: Array<Pick<AnalysisLayerDefinition, "id" | "title" | "shortTitle" | "description" | "category" | "icon" | "visualization"> & { provenanceSource: string }> = [
    { id: "population-density", title: "Плотность населения", shortTitle: "Население", description: "Распределение населения по территории.", category: "demography", icon: "blocks", visualization: visualization("heatmap"), provenanceSource: "Данные населения и жилой площади" },
    { id: "transit-accessibility", title: "Транспортная доступность", shortTitle: "Изохроны", description: "Пешеходные изохроны остановок 5/10/15 минут.", category: "mobility", icon: "transport", visualization: visualization("fill"), provenanceSource: "Пешеходный граф и остановки" },
    { id: "elevation-analysis", title: "Анализ высот и уклонов", shortTitle: "Высоты", description: "Гипсометрия, уклоны, горизонтали и профиль.", category: "landscape", icon: "map", visualization: visualization("raster", true), provenanceSource: "DEM" },
    { id: "functional-zoning", title: "Функциональное зонирование", shortTitle: "Зонирование", description: "Существующее и проектное территориальное зонирование.", category: "planning", icon: "grid", visualization: visualization("fill"), provenanceSource: "Градостроительные зоны" },
    { id: "sun-shadows", title: "Падающие тени", shortTitle: "Тени", description: "Солнечный путь и геометрические тени зданий.", category: "environment", icon: "sun", visualization: visualization("extrusion", true), provenanceSource: "Геометрия зданий и положение солнца" },
    { id: "noise", title: "Шумовое загрязнение", shortTitle: "Шум", description: "Дневной, ночной и транспортный шум.", category: "environment", icon: "noise", visualization: visualization("heatmap"), provenanceSource: "Модель трафика и акустические данные" },
    { id: "wind", title: "Ветровой комфорт", shortTitle: "Ветер", description: "Направление, скорость и зоны дискомфорта.", category: "environment", icon: "layers", visualization: visualization("raster", true), provenanceSource: "Метеоданные и аэродинамическая модель" },
    { id: "visibility", title: "Видовые коридоры", shortTitle: "Виды", description: "Визуальные оси, панорамы и ограничения высоты.", category: "planning", icon: "map", visualization: visualization("fill", true), provenanceSource: "3D-модель и контрольные точки" },
    { id: "social-infrastructure", title: "Социальная инфраструктура", shortTitle: "Социнфра", description: "Обеспеченность школами, медициной, спортом и культурой.", category: "planning", icon: "building", visualization: visualization("symbol"), provenanceSource: "Реестр объектов и нормативная вместимость" },
    { id: "pedestrian-accessibility", title: "Пешеходная доступность", shortTitle: "Пешеходы", description: "Связность, барьеры и доступность для МГН.", category: "mobility", icon: "transport", visualization: visualization("line"), provenanceSource: "Пешеходный граф и барьеры" },
    { id: "suitability", title: "Пригодность для застройки", shortTitle: "Пригодность", description: "Итоговая многокритериальная оценка территории.", category: "composite", icon: "chart", visualization: visualization("fill"), provenanceSource: "Несколько подтверждённых аналитических слоёв" },
  ];

  return reserved.map((layer) => ({
    ...layer,
    status: layer.id === "population-density" ? "heuristic" : "unsupported",
    navigationGroup: layer.id === "population-density" ? "ready" : "development",
    calculatorId: layer.id === "population-density" ? "buildings" : undefined,
    thematicMapType: layer.id === "population-density" ? "population" : undefined,
    metrics: layer.id === "population-density" ? [buildingCount, floors, far, gsi] : [],
    filters: [],
    legend: { source: "calculated" },
    provenance: {
      source: layer.provenanceSource,
      quality: "unknown",
      description: "Режим зарезервирован и не подменяется существующей тематической картой.",
    },
  }));
}

function visualization(type: AnalysisLayerDefinition["visualization"]["type"], supports3D = false) {
  return { type, supports2D: true, supports3D, supportsComparison: false, supportsScenarios: false };
}
