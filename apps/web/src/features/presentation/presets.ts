import type { ThematicMapType } from "@/lib/gis-engine/thematic";

export type PresentationMapPresetId =
  | "population-grid"
  | "transit-access"
  | "population-heatmap"
  | "terrain-height"
  | "building-floors"
  | "building-age"
  | "functional-zoning"
  | "axonometric-zoning"
  | "shadow-analysis";

export interface PresentationMapPreset {
  id: PresentationMapPresetId;
  title: string;
  shortTitle: string;
  description: string;
  method: string;
  thematicMapType: ThematicMapType;
  palette: readonly string[];
  legendTitle: string;
  legendLabels: readonly string[];
}

export const presentationMapPresets: readonly PresentationMapPreset[] = [
  {
    id: "population-grid",
    title: "Моделирование плотности населения / GRID",
    shortTitle: "Плотность · GRID",
    description: "Гексагональная сетка сравнивает расчётную нагрузку на территорию независимыми ячейками.",
    method: "В равных гексагонах суммируются только явные атрибуты population/residents; без них карта не строится.",
    thematicMapType: "density",
    palette: ["#FFF1C7", "#F7D78B", "#F4A75D", "#D9783D", "#9E4A2E"],
    legendTitle: "Градация плотности",
    legendLabels: ["0", "1–50", "50–100", "100–150", "150–200"],
  },
  {
    id: "transit-access",
    title: "Зоны доступности общественного транспорта",
    shortTitle: "Доступность транспорта",
    description: "Показывает покрытие территории остановками и непрерывность пешеходной доступности.",
    method: "Только объекты transit-stop образуют буфер 300 м по прямой; время пути и пешеходная сеть не моделируются.",
    thematicMapType: "accessibility",
    palette: ["#FFF4D6", "#E98272", "#B84A36"],
    legendTitle: "Пешеходная доступность",
    legendLabels: ["Более 300 м", "До 300 м по прямой", "Остановка"],
  },
  {
    id: "population-heatmap",
    title: "Моделирование плотности населения / HEATMAP",
    shortTitle: "Плотность · Heatmap",
    description: "Непрерывное поле выявляет локальные центры высокой расчётной плотности населения.",
    method: "Явные значения population/residents агрегируются без выборки; интенсивность нормируется по максимуму проекта.",
    thematicMapType: "density",
    palette: ["#FFF7E8", "#FBC4A9", "#F47F70", "#BD324A"],
    legendTitle: "Градация плотности",
    legendLabels: ["0", "Низкая", "Средняя", "2 500"],
  },
  {
    id: "terrain-height",
    title: "Картосхема высоты рельефа",
    shortTitle: "Высота рельефа",
    description: "Гипсометрическая карта показывает перепады высот и характер поверхности территории.",
    method: "Числовые отметки elevation окрашиваются по фактическому диапазону; при отсутствии отметок поле не строится.",
    thematicMapType: "terrain",
    palette: ["#2C88B8", "#72C7B5", "#CDEB9A", "#FFF19A", "#F39A55"],
    legendTitle: "Градиент рельефа",
    legendLabels: ["120 м", "140 м", "160 м", "180 м", "190 м"],
  },
  {
    id: "building-floors",
    title: "Схема этажности застройки",
    shortTitle: "Этажность",
    description: "Каждое здание окрашено по количеству этажей, окружающая застройка остаётся нейтральной.",
    method: "Дискретная шкала позволяет быстро сравнить высотный профиль внутри выбранной территории.",
    thematicMapType: "floors",
    palette: ["#FFF1C7", "#FFD95A", "#E3B500", "#7B6500"],
    legendTitle: "Этажность",
    legendLabels: ["1 этаж", "2 этажа", "3 этажа", "4+ этажей"],
  },
  {
    id: "building-age",
    title: "Карта возраста зданий",
    shortTitle: "Возраст зданий",
    description: "Хронологическая карта показывает последовательность формирования застройки.",
    method: "Тёплая шкала идёт от исторических объектов к современной застройке без изменения геометрии зданий.",
    thematicMapType: "age",
    palette: ["#9F0A17", "#D8231F", "#F06A2B", "#FDBE64", "#F58AA8", "#E83273"],
    legendTitle: "Годы постройки",
    legendLabels: ["до 1800", "1800–1920", "1920–1960", "1960–1990", "1990–2020", "после 2020"],
  },
  {
    id: "functional-zoning",
    title: "Схема функционального зонирования",
    shortTitle: "Функции зданий",
    description: "Цвет кодирует назначение объектов и раскрывает функциональную структуру территории.",
    method: "Категории читаются только внутри объекта; фон, дороги и соседние здания остаются монохромными.",
    thematicMapType: "function",
    palette: ["#126A9A", "#F6A6AA", "#C9C2E6", "#F28B20", "#F5CF37", "#D91F2D", "#118D82"],
    legendTitle: "Функции",
    legendLabels: ["Общественные", "Коммерческие", "Религиозные", "Производственные", "Административные", "Жилые", "Хозяйственные"],
  },
  {
    id: "axonometric-zoning",
    title: "Аксонометрия и функциональные зоны",
    shortTitle: "Аксонометрия",
    description: "Архитектурная схема объединяет объёмы зданий, рельеф, маршруты и функциональные зоны.",
    method: "Белая модель приподнята над спокойным основанием; цвет применяется только к зонам и маршрутам.",
    thematicMapType: "function",
    palette: ["#ECE8D6", "#B9C7A4", "#BFDCE1", "#B8B8B3", "#74736D"],
    legendTitle: "Функциональные зоны",
    legendLabels: ["Жилая", "Гостевая", "Пищевая", "Техническая", "Логистика"],
  },
  {
    id: "shadow-analysis",
    title: "Карта продолжительности теней",
    shortTitle: "Инсоляция и тени",
    description: "Показывает зоны краткой, средней и длительной тени от существующей застройки.",
    method: "Проекции объёмов смещаются по направлению условного солнца; здания остаются белыми для максимальной читаемости.",
    thematicMapType: "floors",
    palette: ["#AEB18B", "#F2D58A", "#D96E5F"],
    legendTitle: "Продолжительность тени",
    legendLabels: ["Короткая · 1–2 ч", "Средняя · 2–4 ч", "Длительная · 4+ ч"],
  },
] as const;

export function getPresentationMapPreset(id: PresentationMapPresetId): PresentationMapPreset {
  return presentationMapPresets.find((preset) => preset.id === id) ?? presentationMapPresets[4];
}
