"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Map from "@/components/map";
import { AnalysisEngine, ThematicMapEngine, type AnalysisResult, type ThematicMapType } from "@/lib";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";

type AnalysisLayerId = "far" | "gsi" | "density" | "insolation" | "green" | "transport" | "scenarios";
type ScenarioId = "base" | "compact10" | "compact20" | "optimistic" | "height" | "transit";

interface MetricItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "danger" | "neutral";
  score: number;
  delta?: string;
  unit?: string;
}

interface ScenarioModel {
  id: ScenarioId;
  title: string;
  subtitle: string;
  densityDelta: number;
  greenDelta: number;
  transportDelta: number;
  floorAreaDelta: number;
  color: string;
}

interface AnalysisLayer {
  id: AnalysisLayerId;
  label: string;
  shortLabel: string;
  icon: IconName;
  mapType: ThematicMapType;
}

type IconName =
  | "account"
  | "analysis"
  | "bell"
  | "blocks"
  | "building"
  | "chart"
  | "chevron"
  | "grid"
  | "help"
  | "home"
  | "info"
  | "layers"
  | "map"
  | "noise"
  | "plus"
  | "sun"
  | "transport";

const analysisEngine = new AnalysisEngine();
const thematicMapEngine = new ThematicMapEngine();

const analysisLayers: AnalysisLayer[] = [
  { id: "far", label: "FAR", shortLabel: "FAR", icon: "chart", mapType: "density" },
  { id: "gsi", label: "GSI", shortLabel: "GSI", icon: "grid", mapType: "density" },
  { id: "density", label: "Плотность", shortLabel: "Плотность", icon: "blocks", mapType: "density" },
  { id: "insolation", label: "Инсоляция", shortLabel: "Солнце", icon: "sun", mapType: "floors" },
  { id: "green", label: "Озеленение", shortLabel: "Зелень", icon: "layers", mapType: "vegetation" },
  { id: "transport", label: "Транспортная доступность", shortLabel: "Транспорт", icon: "transport", mapType: "accessibility" },
  { id: "scenarios", label: "Сценарии", shortLabel: "Сценарии", icon: "building", mapType: "none" },
];

const scenarios: ScenarioModel[] = [
  {
    id: "base",
    title: "Базовый",
    subtitle: "текущий сценарий",
    densityDelta: 0,
    greenDelta: 0,
    transportDelta: 0,
    floorAreaDelta: 0,
    color: "#229ED9",
  },
  {
    id: "compact10",
    title: "Уплотнение 10%",
    subtitle: "FAR +10%",
    densityDelta: 8,
    greenDelta: -2,
    transportDelta: 2,
    floorAreaDelta: 10,
    color: "#F59E0B",
  },
  {
    id: "compact20",
    title: "Уплотнение 20%",
    subtitle: "FAR +20%",
    densityDelta: 16,
    greenDelta: -5,
    transportDelta: 3,
    floorAreaDelta: 20,
    color: "#EF4444",
  },
  {
    id: "optimistic",
    title: "Оптимистичный",
    subtitle: "баланс показателей",
    densityDelta: 5,
    greenDelta: 12,
    transportDelta: 12,
    floorAreaDelta: 8,
    color: "#A855F7",
  },
  {
    id: "height",
    title: "Высотный сценарий",
    subtitle: "макс. FAR",
    densityDelta: 10,
    greenDelta: -3,
    transportDelta: 4,
    floorAreaDelta: 28,
    color: "#7C3AED",
  },
  {
    id: "transit",
    title: "Транспорт +",
    subtitle: "доступность",
    densityDelta: 4,
    greenDelta: 3,
    transportDelta: 24,
    floorAreaDelta: 6,
    color: "#22C55E",
  },
];

export default function AnalysisWorkspace() {
  const project = useProjectStore((state) => state.project);
  const activeLayerId = useUIStore((state) => state.activeAnalysisLayerId as AnalysisLayerId);
  const activeScenarioId = useUIStore((state) => state.activeScenarioId as ScenarioId);
  const compareScenarioId = useUIStore((state) => state.compareScenarioId as ScenarioId);
  const setActiveLayerId = useUIStore((state) => state.setActiveAnalysisLayerId);
  const setActiveScenarioId = useUIStore((state) => state.setActiveScenarioId);
  const setCompareScenarioId = useUIStore((state) => state.setCompareScenarioId);
  const completeWorkflowStage = useUIStore((state) => state.completeWorkflowStage);
  const analysis = useMemo(() => analysisEngine.analyze(project), [project]);
  const model = useMemo(() => buildAnalysisModel(analysis), [analysis]);
  const activeLayer = analysisLayers.find((layer) => layer.id === activeLayerId) ?? analysisLayers[0];
  const activeMetric = model.metricsById[activeLayerId] ?? model.metricsById.far;
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0];
  const compareScenario = scenarios.find((scenario) => scenario.id === compareScenarioId) ?? scenarios[3];
  const activeProjection = projectScenario(model, activeScenario);
  const compareProjection = projectScenario(model, compareScenario);
  const thematicMap = useMemo(
    () => thematicMapEngine.generate(activeLayer.mapType, project, analysis),
    [activeLayer.mapType, analysis, project]
  );

  return (
    <main className="flex h-full flex-col overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <section className="relative min-h-0 flex-1 overflow-hidden bg-[#EAF4FA]">
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-[31%] top-[-22px] text-[clamp(150px,22vw,340px)] font-black leading-none text-[#0F172A] opacity-[0.04]">
            АНАЛИЗ
          </div>
          <div className="absolute right-[-12%] top-[-26%] h-[64vh] w-[46vw] -skew-x-12 border-l border-white/60 bg-white/10" />
        </div>

        <Map
          workspaceModeOverride="analysis"
          thematicMapTypeOverride={activeLayer.mapType}
          thematicMapOverride={thematicMap}
          showNavigationControls={false}
        />

        <AnalysisRail activeLayerId={activeLayerId} onChange={setActiveLayerId} />
        <IndicatorPanel model={model} activeLayerId={activeLayerId} onChange={setActiveLayerId} />
        <CurrentIndicator metric={activeMetric} activeLayer={activeLayer} />
        <ScenarioPicker activeScenario={activeScenario} />
        <ScenarioPanel
          activeScenarioId={activeScenarioId}
          compareScenarioId={compareScenarioId}
          onActiveChange={setActiveScenarioId}
          onCompareChange={setCompareScenarioId}
          activeProjection={activeProjection}
          compareProjection={compareProjection}
          onCompleteAnalysis={() => completeWorkflowStage("analysis")}
        />
        <BottomMetrics model={model} />
        <LegendPanel metric={activeMetric} />
        <MobileAnalysisSheet
          model={model}
          activeScenario={activeScenario}
          onCompleteAnalysis={() => completeWorkflowStage("analysis")}
        />

        <div className="pointer-events-none absolute bottom-[206px] right-[360px] z-20 hidden rounded-[18px] border border-white/70 bg-white/65 px-4 py-3 text-lg font-bold text-[#229ED9] backdrop-blur-3xl xl:block">
          2D
        </div>
      </section>
    </main>
  );
}

function AnalysisRail({
  activeLayerId,
  onChange,
}: {
  activeLayerId: AnalysisLayerId;
  onChange: (id: AnalysisLayerId) => void;
}) {
  return (
    <aside className="absolute bottom-5 left-4 top-5 z-20 flex w-[68px] flex-col items-center rounded-[20px] border border-white/70 bg-white/62 py-4 backdrop-blur-3xl max-lg:hidden">
      <button
        type="button"
        className="mb-4 flex h-[58px] w-[54px] flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium text-[#0F172A]"
      >
        <Icon name="home" />
        Обзор
      </button>
      <div className="flex flex-1 flex-col items-center gap-2">
        {analysisLayers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => onChange(layer.id)}
            className={`relative flex h-[62px] w-[54px] flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium transition duration-200 ease-out hover:-translate-y-0.5 ${
              activeLayerId === layer.id ? "bg-[#229ED9]/10 text-[#229ED9]" : "text-[#64748B]"
            }`}
          >
            {activeLayerId === layer.id ? (
              <span className="absolute -left-[7px] h-9 w-0.5 rounded-full bg-[#229ED9]" />
            ) : null}
            <Icon name={layer.icon} />
            {layer.shortLabel}
          </button>
        ))}
      </div>
      <IconButton label="Карта" icon="map" />
    </aside>
  );
}

function IndicatorPanel({
  model,
  activeLayerId,
  onChange,
}: {
  model: ReturnType<typeof buildAnalysisModel>;
  activeLayerId: AnalysisLayerId;
  onChange: (id: AnalysisLayerId) => void;
}) {
  const featured = [
    model.metricsById.far,
    model.metricsById.gsi,
    model.metricsById.density,
    model.metricsById.noise,
    model.metricsById.transport,
  ];

  return (
    <aside className="absolute bottom-[190px] left-[96px] top-5 z-20 flex w-[305px] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/62 backdrop-blur-3xl max-xl:left-5 max-lg:hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-base font-semibold">Показатели</h1>
        <span className="text-[#94A3B8]">
          <Icon name="info" />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
        {featured.map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() => onChange(metric.id === "noise" ? "insolation" : (metric.id as AnalysisLayerId))}
            className={`w-full border-t border-[#E2E8F0]/70 py-5 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${
              activeLayerId === metric.id ? "opacity-100" : "opacity-95"
            }`}
          >
            <MetricRow metric={metric} />
          </button>
        ))}
        <div className="border-t border-[#E2E8F0]/70 pt-4">
          <p className="mb-3 text-[12px] font-semibold text-[#94A3B8]">Дополнительная аналитика</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              model.metricsById.bcr,
              model.metricsById.floors,
              model.metricsById.green,
              model.metricsById.isochrones,
              model.metricsById.charts,
            ].map((metric) => (
              <div key={metric.id} className="rounded-[14px] border border-white/70 bg-white/45 px-3 py-2">
                <p className="truncate text-[12px] font-semibold">{metric.label}</p>
                <p className="mt-1 text-[12px] text-[#64748B]">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/70 p-5">
        <button className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/70 bg-white/60 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5">
          <Icon name="chart" />
          Показать сводку KPI
        </button>
      </div>
    </aside>
  );
}

function CurrentIndicator({ metric, activeLayer }: { metric: MetricItem; activeLayer: AnalysisLayer }) {
  return (
    <section className="absolute left-[430px] top-7 z-20 w-[205px] rounded-[20px] border border-white/70 bg-white/62 p-5 backdrop-blur-3xl max-xl:left-[350px] max-lg:left-5 max-lg:top-5 max-md:right-4 max-md:w-auto">
      <p className="text-[12px] font-medium text-[#94A3B8]">Текущий показатель</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#229ED9]/10 text-[#229ED9]">
            <Icon name={activeLayer.icon} />
          </span>
          <span className="text-lg font-semibold">{metric.label}</span>
        </div>
        <Icon name="chevron" />
      </div>
    </section>
  );
}

function ScenarioPicker({ activeScenario }: { activeScenario: ScenarioModel }) {
  return (
    <section className="absolute right-[364px] top-[116px] z-20 w-[190px] rounded-[20px] border border-white/70 bg-white/62 p-4 backdrop-blur-3xl max-xl:hidden">
      <p className="text-[12px] font-medium text-[#94A3B8]">Сценарий</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activeScenario.color }} />
          <span className="truncate text-sm font-semibold">{activeScenario.title}</span>
        </div>
        <Icon name="chevron" />
      </div>
    </section>
  );
}

function ScenarioPanel({
  activeScenarioId,
  compareScenarioId,
  onActiveChange,
  onCompareChange,
  activeProjection,
  compareProjection,
  onCompleteAnalysis,
}: {
  activeScenarioId: ScenarioId;
  compareScenarioId: ScenarioId;
  onActiveChange: (id: ScenarioId) => void;
  onCompareChange: (id: ScenarioId) => void;
  activeProjection: ReturnType<typeof projectScenario>;
  compareProjection: ReturnType<typeof projectScenario>;
  onCompleteAnalysis: () => void;
}) {
  return (
    <aside className="absolute bottom-[190px] right-5 top-[116px] z-20 flex w-[330px] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/62 backdrop-blur-3xl max-xl:top-5 max-lg:hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <h2 className="text-base font-semibold">Сценарии</h2>
        <button className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-[#229ED9]/25 text-[#229ED9]">
            <Icon name="plus" />
          </span>
          Новый сценарий
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => {
              onActiveChange(scenario.id);
              onCompareChange(scenario.id === activeScenarioId ? compareScenarioId : scenario.id);
            }}
            className="flex w-full items-center gap-4 border-t border-[#E2E8F0]/70 py-4 text-left transition duration-200 ease-out hover:-translate-y-0.5"
          >
            <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: scenario.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{scenario.title}</span>
              <span className="mt-1 block truncate text-[12px] text-[#64748B]">{scenario.subtitle}</span>
            </span>
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border ${
                activeScenarioId === scenario.id ? "border-[#229ED9] bg-[#229ED9]" : "border-[#94A3B8]"
              }`}
            >
              {activeScenarioId === scenario.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-white/70 p-5">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <CompareMetric label="FAR" left={activeProjection.far} right={compareProjection.far} suffix="" />
          <CompareMetric label="GSI" left={activeProjection.gsi} right={compareProjection.gsi} suffix="%" />
          <CompareMetric label="KPI" left={activeProjection.score} right={compareProjection.score} suffix="" />
        </div>
        <button className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/70 bg-white/60 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5">
          <Icon name="grid" />
          Сравнить сценарии
        </button>
        <button
          type="button"
          onClick={onCompleteAnalysis}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#229ED9] text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
        >
          <Icon name="analysis" />
          Завершить анализ
        </button>
      </div>
    </aside>
  );
}

function BottomMetrics({ model }: { model: ReturnType<typeof buildAnalysisModel> }) {
  const metrics = [
    model.metricsById.far,
    model.metricsById.gsi,
    model.metricsById.density,
    model.metricsById.noise,
    model.metricsById.insolation,
    model.metricsById.transport,
  ];

  return (
    <section className="absolute bottom-5 left-[96px] right-[360px] z-20 grid h-[160px] grid-cols-6 gap-3 max-xl:left-5 max-xl:right-5 max-lg:grid-cols-3 max-md:hidden">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}

function LegendPanel({ metric }: { metric: MetricItem }) {
  return (
    <aside className="absolute bottom-5 right-5 z-20 h-[160px] w-[330px] rounded-[20px] border border-white/70 bg-white/62 p-5 backdrop-blur-3xl max-xl:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Легенда {metric.label}</h3>
          <p className="mt-1 text-[12px] text-[#64748B]">Диаграммы и шкала текущего показателя</p>
        </div>
        <Icon name="info" />
      </div>
      <div className="mt-5 h-5 rounded-full bg-[linear-gradient(90deg,#FEF3C7_0%,#FDBA74_25%,#FB7185_52%,#A855F7_100%)]" />
      <div className="mt-3 flex justify-between text-[12px] text-[#0F172A]">
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4+</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0]/70 pt-3 text-[13px] text-[#64748B]">
        <span>Единицы: коэффициент</span>
        <Icon name="chevron" />
      </div>
    </aside>
  );
}

function MobileAnalysisSheet({
  model,
  activeScenario,
  onCompleteAnalysis,
}: {
  model: ReturnType<typeof buildAnalysisModel>;
  activeScenario: ScenarioModel;
  onCompleteAnalysis: () => void;
}) {
  const metrics = [
    model.metricsById.far,
    model.metricsById.gsi,
    model.metricsById.bcr,
    model.metricsById.density,
    model.metricsById.floors,
    model.metricsById.noise,
    model.metricsById.insolation,
    model.metricsById.green,
    model.metricsById.transport,
    model.metricsById.isochrones,
    model.metricsById.kpi,
    model.metricsById.charts,
  ];

  return (
    <aside className="absolute bottom-4 left-4 right-4 z-20 hidden max-h-[42vh] overflow-y-auto rounded-[20px] border border-white/70 bg-white/62 p-4 backdrop-blur-3xl max-lg:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-[#229ED9]">Анализ</p>
          <h2 className="mt-1 text-lg font-semibold">Показатели проекта</h2>
        </div>
        <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1 text-[12px] font-semibold">
          Сценарии: {activeScenario.title}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded-[14px] border border-white/70 bg-white/45 p-3">
            <p className="truncate text-[12px] font-semibold">{metric.label}</p>
            <p className="mt-1 text-lg font-semibold">
              {metric.value}
              {metric.unit ? <span className="ml-1 text-[12px]">{metric.unit}</span> : null}
            </p>
            <p className="mt-1 truncate text-[11px] text-[#64748B]">{metric.detail}</p>
          </div>
        ))}
      </div>
      <button className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-white/70 bg-white/60 text-sm font-semibold">
        <Icon name="grid" />
        Сравнить сценарии
      </button>
      <button
        type="button"
        onClick={onCompleteAnalysis}
        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[14px] bg-[#229ED9] text-sm font-semibold text-white"
      >
        <Icon name="analysis" />
        Завершить анализ
      </button>
    </aside>
  );
}

function MetricRow({ metric }: { metric: MetricItem }) {
  return (
    <div className="grid grid-cols-[32px_1fr] gap-3">
      <span className="mt-2 text-[#0F172A]">
        <Icon name={metric.id === "noise" ? "noise" : metric.id === "transport" ? "transport" : "blocks"} />
      </span>
      <span>
        <span className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[#64748B]">{metric.detail}</span>
          {metric.delta ? <span className="text-[12px] font-semibold text-[#22C55E]">{metric.delta}</span> : null}
        </span>
        <span className="mt-1 flex items-end gap-2">
          <span className="text-[30px] font-semibold leading-none">{metric.value}</span>
          {metric.unit ? <span className="pb-1 text-sm font-semibold">{metric.unit}</span> : null}
        </span>
        <Progress value={metric.score} color={getToneColor(metric.tone)} className="mt-3" />
      </span>
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricItem }) {
  return (
    <article className="min-w-0 rounded-[20px] border border-white/70 bg-white/62 p-4 backdrop-blur-3xl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold">{metric.label}</h3>
        <span className="text-[#94A3B8]">
          <Icon name="info" />
        </span>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none">
        {metric.value}
        {metric.unit ? <span className="ml-1 text-sm">{metric.unit}</span> : null}
      </p>
      <Sparkline color={getToneColor(metric.tone)} />
      <p className="mt-2 truncate text-[12px] text-[#64748B]">{metric.detail}</p>
    </article>
  );
}

function CompareMetric({
  label,
  left,
  right,
  suffix,
}: {
  label: string;
  left: number;
  right: number;
  suffix: string;
}) {
  const delta = right - left;
  const positive = delta >= 0;

  return (
    <div className="rounded-[14px] border border-white/70 bg-white/45 p-3">
      <p className="text-[11px] text-[#64748B]">{label}</p>
      <p className="mt-1 text-base font-semibold">
        {formatNumber(right)}
        {suffix}
      </p>
      <p className={`mt-1 text-[11px] font-semibold ${positive ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
        {positive ? "+" : ""}
        {formatNumber(delta)}
        {suffix}
      </p>
    </div>
  );
}

function IconButton({ label, icon }: { label: string; icon: IconName }) {
  return (
    <button
      type="button"
      className="grid h-10 w-10 place-items-center rounded-[14px] text-[#0F172A] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/55"
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}

function Progress({ value, color, className = "" }: { value: number; color: string; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]/80 ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${clamp(value, 0, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg className="mt-3 h-8 w-full" viewBox="0 0 140 34" fill="none" aria-hidden="true">
      <path d="M2 27H28L34 14L41 28L47 27H86L95 10L103 14L111 27H138" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 27H138" stroke="#CBD5E1" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    account: <path d="M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
    analysis: <path d="M4 19V5m6 14V9m6 10V3m4 16H3" />,
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-4.3 13a2 2 0 0 1-3.4 0" />,
    blocks: <path d="M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z" />,
    building: <path d="m4 8 8-4 8 4v10l-8 4-8-4Zm4 2v6m4-8v10m4-8v6" />,
    chart: <path d="M4 19V5m0 14h16M8 16l3-5 4 3 4-8" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    grid: <path d="M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z" />,
    help: <path d="M9.1 9a3 3 0 1 1 5.1 2.1c-.9.8-1.7 1.3-1.7 2.9M12 18h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
    info: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    layers: <path d="m12 3 9 5-9 5-9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4" />,
    map: <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15" />,
    noise: <path d="M4 14v-4m4 8V6m4 15V3m4 15V6m4 8v-4" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    sun: <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m0-12.8L4.2 4.2m15.6 15.6-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
    transport: <path d="M6 17h12l1-6-2-5H7l-2 5Zm1 0-1 3m11-3 1 3M7 11h10M8 14h.01M16 14h.01" />,
  };

  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function buildAnalysisModel(analysis: AnalysisResult) {
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
  const transportScore = clamp(
    analysis.territory.transitStopCount * 12 + Math.min(60, roadDensity / 45),
    0,
    100
  );
  const compositeScore = Math.round(
    clamp((insolationScore + greenPercent + transportScore + (100 - noiseScore)) / 4, 0, 100)
  );

  const metrics: MetricItem[] = [
    {
      id: "far",
      label: "FAR",
      value: formatNumber(far),
      detail: "Средний FAR",
      tone: far > 2.4 ? "warning" : "primary",
      score: clamp((far / 3) * 100, 0, 100),
      delta: "+14%",
    },
    {
      id: "gsi",
      label: "GSI",
      value: formatNumber(gsi / 100),
      detail: "Средний GSI",
      tone: gsi > 45 ? "warning" : "primary",
      score: clamp(gsi, 0, 100),
      delta: "+8%",
    },
    {
      id: "bcr",
      label: "BCR",
      value: formatNumber(bcr / 100),
      detail: "Коэффициент покрытия",
      tone: bcr > 50 ? "warning" : "neutral",
      score: clamp(bcr, 0, 100),
    },
    {
      id: "density",
      label: "Плотность",
      value: formatNumber(density * 220),
      detail: "Плотность населения",
      tone: density > 80 ? "warning" : "neutral",
      score: clamp((density / 100) * 100, 0, 100),
      delta: "+12%",
      unit: "чел/га",
    },
    {
      id: "floors",
      label: "Средняя этажность",
      value: averageFloors ? formatNumber(averageFloors) : "-",
      detail: `${analysis.buildings.count.toLocaleString("ru-RU")} зданий`,
      tone: averageFloors > 12 ? "warning" : "primary",
      score: clamp((averageFloors / 20) * 100, 0, 100),
    },
    {
      id: "noise",
      label: "Шум",
      value: String(noiseDb),
      detail: "Шум (день)",
      tone: noiseScore > 70 ? "danger" : noiseScore > 45 ? "warning" : "success",
      score: noiseScore,
      unit: "дБ",
    },
    {
      id: "insolation",
      label: "Инсоляция",
      value: formatNumber(insolationHours),
      detail: "Инсоляция",
      tone: insolationScore > 65 ? "success" : insolationScore > 40 ? "warning" : "danger",
      score: insolationScore,
      unit: "ч",
    },
    {
      id: "green",
      label: "Озеленение",
      value: formatPercent(greenPercent),
      detail: `${formatArea(analysis.vegetation.area)} зеленых территорий`,
      tone: greenPercent > 25 ? "success" : greenPercent > 12 ? "warning" : "danger",
      score: greenPercent,
    },
    {
      id: "transport",
      label: "Транспорт",
      value: formatNumber(transportScore / 10),
      detail: "Транспортная доступность",
      tone: transportScore > 70 ? "success" : transportScore > 40 ? "warning" : "danger",
      score: transportScore,
      unit: "/ 10",
    },
    {
      id: "kpi",
      label: "KPI",
      value: `${compositeScore}/100`,
      detail: "сводный индекс среды",
      tone: compositeScore >= 70 ? "success" : compositeScore >= 45 ? "warning" : "danger",
      score: compositeScore,
    },
    {
      id: "isochrones",
      label: "Изохроны",
      value: `${Math.round(transportScore)}/100`,
      detail: "5, 10 и 15 минут",
      tone: transportScore > 70 ? "success" : transportScore > 40 ? "warning" : "danger",
      score: transportScore,
    },
    {
      id: "charts",
      label: "Диаграммы",
      value: formatPercent(greenPercent + waterPercent),
      detail: "структура территории",
      tone: "primary",
      score: clamp(greenPercent + waterPercent, 0, 100),
    },
  ];

  return {
    far,
    gsi,
    bcr,
    density,
    averageFloors,
    greenPercent,
    waterPercent,
    roadDensity,
    noiseScore,
    insolationScore,
    transportScore: Math.round(transportScore),
    compositeScore,
    metrics,
    metricsById: Object.fromEntries(metrics.map((metric) => [metric.id, metric])) as Record<string, MetricItem>,
  };
}

function projectScenario(model: ReturnType<typeof buildAnalysisModel>, scenario: ScenarioModel) {
  const far = model.far * (1 + scenario.floorAreaDelta / 100);
  const gsi = clamp(model.gsi + scenario.densityDelta * 0.35, 0, 100);
  const score = Math.round(
    clamp(
      model.compositeScore +
        scenario.greenDelta * 0.35 +
        scenario.transportDelta * 0.3 -
        Math.max(0, scenario.densityDelta) * 0.12,
      0,
      100
    )
  );

  return { far, gsi, score };
}

function getToneColor(tone: MetricItem["tone"]): string {
  if (tone === "success") return "#22C55E";
  if (tone === "warning") return "#F59E0B";
  if (tone === "danger") return "#EF4444";
  if (tone === "primary") return "#229ED9";
  return "#64748B";
}

function formatArea(valueSqM: number): string {
  if (valueSqM >= 1_000_000) return `${formatNumber(valueSqM / 1_000_000)} км²`;
  return `${Math.round(valueSqM).toLocaleString("ru-RU")} м²`;
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 999)).toLocaleString("ru-RU")}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: value >= 10 ? 0 : 2,
    minimumFractionDigits: value > 0 && value < 10 ? 2 : 0,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
