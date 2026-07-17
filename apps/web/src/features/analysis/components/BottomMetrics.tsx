import type { AnalysisMetricViewModel } from "@/features/analysis/registry";
import { AnalysisIcon } from "./AnalysisIcon";
import { getMetricToneColor } from "./analysisDisplay";

export function BottomMetrics({ metrics, collapsed, navigationCollapsed, onCollapsedChange }: { metrics: AnalysisMetricViewModel[]; collapsed: boolean; navigationCollapsed: boolean; onCollapsedChange: (collapsed: boolean) => void }) {
  const left = navigationCollapsed ? 280 : 408;

  if (collapsed) {
    return (
      <button type="button" aria-label="Открыть сводку показателей" onClick={() => onCollapsedChange(false)} className="absolute bottom-[58px] z-30 hidden h-11 items-center gap-2 rounded-[16px] border border-white/70 bg-white/68 px-4 text-[13px] font-semibold backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 lg:flex" style={{ left }}>
        <AnalysisIcon name="chart" className="h-[18px] w-[18px] text-[#229ED9]" />
        Сводка
      </button>
    );
  }

  return (
    <section className="absolute bottom-[58px] right-4 z-20 hidden h-[136px] items-stretch gap-2 overflow-x-auto [scrollbar-width:none] lg:flex" style={{ left }} aria-label="Сводка показателей">
      {metrics.slice(0, 5).map((metric) => <MetricCard key={metric.id} metric={metric} />)}
    </section>
  );
}

function MetricCard({ metric }: { metric: AnalysisMetricViewModel }) {
  const hasData = metric.state === "ready";
  return (
    <article className="min-w-[180px] flex-1 rounded-[16px] border border-white/70 bg-white/68 p-3 backdrop-blur-3xl" data-metric-state={metric.state}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[10px] font-medium text-[#64748B]">{metric.label}</h3>
        <AnalysisIcon name="info" className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
      </div>
      {hasData ? (
        <p className="mt-2 truncate text-[21px] font-semibold leading-none">{metric.value}{metric.unit ? <span className="ml-1 text-[9px] font-medium text-[#64748B]">{metric.unit}</span> : null}</p>
      ) : <p className="mt-2 text-[12px] font-semibold text-[#64748B]">Нет данных</p>}
      <MetricChart metric={metric} muted={!hasData} />
      <div className="mt-1 flex items-center gap-3 text-[9px]">
        {hasData && metric.delta ? <span className="shrink-0 font-semibold text-[#16A34A]">{metric.delta}</span> : null}
        <span className="truncate text-[#94A3B8]">vs предыдущий расчёт</span>
      </div>
    </article>
  );
}

function MetricChart({ metric, muted }: { metric: AnalysisMetricViewModel; muted: boolean }) {
  const color = muted ? "#CBD5E1" : getChartColor(metric.id, metric.tone);
  if (metric.id === "gsi" || metric.id === "bcr") {
    return (
      <svg className="mt-2 h-7 w-full" viewBox="0 0 140 34" fill="none" aria-hidden="true">
        <path d="M2 30H138" stroke="#CBD5E1" opacity=".7" />
        <g fill={color}>{[12, 27, 18, 23, 21, 29].map((height, index) => <rect key={index} x={6 + index * 22} y={30 - height} width="12" height={height} rx="3" opacity={0.48 + index * 0.08} />)}</g>
      </svg>
    );
  }
  const path = metric.id.includes("floor") ? "M2 27L25 27L50 13L76 19L102 14L120 5L138 7" : metric.id.includes("building") ? "M2 28L25 24L50 16L75 21L102 9L138 21" : "M2 27L25 24L49 17L75 20L92 10L108 15L138 7";
  return (
    <svg className="mt-2 h-7 w-full" viewBox="0 0 140 34" fill="none" aria-hidden="true">
      <path d="M2 30H138" stroke="#CBD5E1" opacity=".7" />
      <path d={`${path}V30H2Z`} fill={color} opacity=".08" />
      <path d={path} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getChartColor(metricId: string, tone: AnalysisMetricViewModel["tone"]): string {
  if (metricId === "gsi") return "#F59E0B";
  if (metricId === "bcr") return "#EAB308";
  if (metricId.includes("floor")) return "#8B5CF6";
  if (metricId.includes("building")) return "#475569";
  return getMetricToneColor(tone);
}
