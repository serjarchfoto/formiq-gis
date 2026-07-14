import type { AnalysisResult } from "@/lib";

export interface MetricItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "danger" | "neutral";
  score: number;
  delta?: string;
  unit?: string;
}

export type AnalysisScenarioId = "base" | "compact10" | "compact20" | "optimistic" | "height" | "transit";

export interface ScenarioModel {
  id: AnalysisScenarioId;
  title: string;
  subtitle: string;
  densityDelta: number;
  greenDelta: number;
  transportDelta: number;
  floorAreaDelta: number;
  color: string;
}

export const analysisScenarios: ScenarioModel[] = [
  { id: "base", title: "Базовый", subtitle: "текущий сценарий", densityDelta: 0, greenDelta: 0, transportDelta: 0, floorAreaDelta: 0, color: "#229ED9" },
  { id: "compact10", title: "Уплотнение 10%", subtitle: "FAR +10%", densityDelta: 8, greenDelta: -2, transportDelta: 2, floorAreaDelta: 10, color: "#F59E0B" },
  { id: "compact20", title: "Уплотнение 20%", subtitle: "FAR +20%", densityDelta: 16, greenDelta: -5, transportDelta: 3, floorAreaDelta: 20, color: "#EF4444" },
  { id: "optimistic", title: "Оптимистичный", subtitle: "баланс показателей", densityDelta: 5, greenDelta: 12, transportDelta: 12, floorAreaDelta: 8, color: "#A855F7" },
  { id: "height", title: "Высотный сценарий", subtitle: "макс. FAR", densityDelta: 10, greenDelta: -3, transportDelta: 4, floorAreaDelta: 28, color: "#7C3AED" },
  { id: "transit", title: "Транспорт +", subtitle: "доступность", densityDelta: 4, greenDelta: 3, transportDelta: 24, floorAreaDelta: 6, color: "#22C55E" },
];

export function buildAnalysisModel(analysis: AnalysisResult) {
  const territoryArea = Math.max(0, analysis.territory.area);
  const territoryHa = territoryArea / 10_000;
  const far = territoryArea ? analysis.buildings.totalFloorArea / territoryArea : 0;
  const gsi = territoryArea ? (analysis.buildings.footprintArea / territoryArea) * 100 : 0;
  const bcr = gsi;
  const density = territoryHa ? analysis.buildings.count / territoryHa : 0;
  const averageFloors = analysis.buildings.averageLevels ?? 0;
  const roadDensity = territoryHa ? analysis.roads.totalLength / territoryHa : 0;
  const noiseScore = clamp((roadDensity / 220) * 100, 0, 100);
  const noiseDb = Math.round(45 + noiseScore * 0.33);
  const insolationScore = clamp(100 - averageFloors * 5 - gsi * 0.35, 0, 100);
  const insolationHours = clamp(insolationScore / 18, 1.2, 6.8);
  const greenPercent = clamp(analysis.vegetation.territoryPercent, 0, 100);
  const waterPercent = clamp(analysis.water.territoryPercent, 0, 100);
  const transportScore = clamp(analysis.territory.transitStopCount * 12 + Math.min(60, roadDensity / 45), 0, 100);
  const compositeScore = Math.round(clamp((insolationScore + greenPercent + transportScore + (100 - noiseScore)) / 4, 0, 100));

  const metrics: MetricItem[] = [
    { id: "far", label: "FAR", value: formatNumber(far), detail: "Средний FAR", tone: far > 2.4 ? "warning" : "primary", score: clamp((far / 3) * 100, 0, 100), delta: "+14%" },
    { id: "gsi", label: "GSI", value: formatNumber(gsi / 100), detail: "Средний GSI", tone: gsi > 45 ? "warning" : "primary", score: clamp(gsi, 0, 100), delta: "+8%" },
    { id: "bcr", label: "BCR", value: formatNumber(bcr / 100), detail: "Коэффициент покрытия", tone: bcr > 50 ? "warning" : "neutral", score: clamp(bcr, 0, 100) },
    { id: "density", label: "Плотность", value: formatNumber(density * 220), detail: "Плотность населения", tone: density > 80 ? "warning" : "neutral", score: clamp(density, 0, 100), delta: "+12%", unit: "чел/га" },
    { id: "floors", label: "Средняя этажность", value: averageFloors ? formatNumber(averageFloors) : "—", detail: `${analysis.buildings.count.toLocaleString("ru-RU")} зданий`, tone: averageFloors > 12 ? "warning" : "primary", score: clamp((averageFloors / 20) * 100, 0, 100) },
    { id: "noise", label: "Шум", value: String(noiseDb), detail: "Шум (день)", tone: noiseScore > 70 ? "danger" : noiseScore > 45 ? "warning" : "success", score: noiseScore, unit: "дБ" },
    { id: "insolation", label: "Инсоляция", value: formatNumber(insolationHours), detail: "Инсоляция", tone: insolationScore > 65 ? "success" : insolationScore > 40 ? "warning" : "danger", score: insolationScore, unit: "ч" },
    { id: "green", label: "Озеленение", value: formatPercent(greenPercent), detail: `${formatArea(analysis.vegetation.area)} зеленых территорий`, tone: greenPercent > 25 ? "success" : greenPercent > 12 ? "warning" : "danger", score: greenPercent },
    { id: "transport", label: "Транспорт", value: formatNumber(transportScore / 10), detail: "Транспортная доступность", tone: transportScore > 70 ? "success" : transportScore > 40 ? "warning" : "danger", score: transportScore, unit: "/ 10" },
    { id: "kpi", label: "KPI", value: `${compositeScore}/100`, detail: "сводный индекс среды", tone: compositeScore >= 70 ? "success" : compositeScore >= 45 ? "warning" : "danger", score: compositeScore },
    { id: "isochrones", label: "Изохроны", value: `${Math.round(transportScore)}/100`, detail: "5, 10 и 15 минут", tone: transportScore > 70 ? "success" : transportScore > 40 ? "warning" : "danger", score: transportScore },
    { id: "charts", label: "Диаграммы", value: formatPercent(greenPercent + waterPercent), detail: "структура территории", tone: "primary", score: clamp(greenPercent + waterPercent, 0, 100) },
  ];

  return { far, gsi, bcr, density, averageFloors, buildingCount: analysis.buildings.count, greenPercent, waterPercent, roadDensity, noiseScore, insolationScore, transportScore: Math.round(transportScore), compositeScore, metrics, metricsById: Object.fromEntries(metrics.map((metric) => [metric.id, metric])) as Record<string, MetricItem> };
}

export function projectScenario(model: ReturnType<typeof buildAnalysisModel>, scenario: ScenarioModel) {
  const far = model.far * (1 + scenario.floorAreaDelta / 100);
  const gsi = clamp(model.gsi + scenario.densityDelta * 0.35, 0, 100);
  const score = Math.round(clamp(model.compositeScore + scenario.greenDelta * 0.35 + scenario.transportDelta * 0.3 - Math.max(0, scenario.densityDelta) * 0.12, 0, 100));
  return { far, gsi, score };
}

export function getAnalysisScenario(id: string): ScenarioModel {
  return analysisScenarios.find((scenario) => scenario.id === id) ?? analysisScenarios[0];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

function formatArea(valueSqM: number): string {
  if (valueSqM >= 1_000_000) return `${formatNumber(valueSqM / 1_000_000)} км²`;
  return `${Math.round(valueSqM).toLocaleString("ru-RU")} м²`;
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 999)).toLocaleString("ru-RU")}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
