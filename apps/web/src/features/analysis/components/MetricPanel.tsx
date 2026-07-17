import type { AnalysisLayerDefinition, AnalysisMetricViewModel } from "@/features/analysis/registry";
import { AnalysisIcon } from "./AnalysisIcon";

export function MetricPanel({
  metrics,
  collapsed,
  navigationCollapsed,
  onCollapsedChange,
  onShowSummary,
}: {
  layer: AnalysisLayerDefinition;
  metrics: AnalysisMetricViewModel[];
  collapsed: boolean;
  navigationCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onShowSummary: () => void;
}) {
  const left = navigationCollapsed ? 16 : 138;

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Открыть панель показателей"
        onClick={() => onCollapsedChange(false)}
        className="absolute top-4 z-30 hidden h-12 items-center gap-2 rounded-[18px] border border-white/70 bg-white/68 px-4 text-[13px] font-semibold backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 lg:flex"
        style={{ left }}
      >
        <AnalysisIcon name="chart" className="h-[18px] w-[18px] text-[#229ED9]" />
        Показатели
      </button>
    );
  }

  return (
    <aside
      className="absolute bottom-[155px] top-4 z-30 hidden w-[248px] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/68 backdrop-blur-3xl lg:flex"
      style={{ left }}
      aria-label="Показатели активного анализа"
    >
      <header className="shrink-0 border-b border-white/75 px-4 py-4">
        <h1 className="text-[16px] font-semibold leading-5">Показатели</h1>
        <p className="mt-1 text-[11px] text-[#64748B]">Расчётные показатели территории</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5 [scrollbar-width:thin]">
        {metrics.slice(0, 5).map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
        {metrics.length === 0 ? (
          <div className="rounded-[14px] border border-white/70 bg-white/48 px-4 py-3 text-[12px] leading-5 text-[#64748B]">
            Для этого режима показатели пока не определены.
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-white/75 p-2.5">
        <button
          type="button"
          onClick={onShowSummary}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-white/70 bg-white/62 text-[12px] font-semibold transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/82"
        >
          <AnalysisIcon name="chart" className="h-4 w-4 text-[#229ED9]" />
          Показать сводку KPI
        </button>
      </footer>
    </aside>
  );
}

function MetricCard({ metric }: { metric: AnalysisMetricViewModel }) {
  const hasData = metric.state === "ready";
  const color = hasData ? getMetricColor(metric.id) : "#94A3B8";
  return (
    <article className="min-h-[70px] flex-1 rounded-[16px] border border-white/75 bg-white/52 p-3" data-metric-state={metric.state}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px]" style={{ color, backgroundColor: `${color}12` }}>
          <AnalysisIcon name={resolveMetricIcon(metric.id)} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-[11px] font-semibold text-[#0F172A]">{metric.label}</h2>
            <button type="button" aria-label={`О показателе ${metric.label}`} title={metric.detail} className="shrink-0 text-[#94A3B8]">
              <AnalysisIcon name="info" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="min-w-0 flex-1 truncate text-[23px] font-semibold leading-none">
              {hasData ? metric.value : "—"}
              {hasData && metric.unit ? <span className="ml-1 text-[10px] font-medium text-[#64748B]">{metric.unit}</span> : null}
            </p>
            {hasData && metric.delta ? <span className="pb-0.5 text-[10px] font-semibold text-[#16A34A]">{metric.delta}</span> : null}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#E2E8F0]/85">
            <div className="h-full rounded-full" style={{ width: `${hasData ? clamp(metric.score, 0, 100) : 0}%`, backgroundColor: color }} />
          </div>
        </div>
      </div>
    </article>
  );
}

function resolveMetricIcon(metricId: string): "analysis" | "blocks" | "building" | "chart" | "layers" | "transport" {
  if (metricId.includes("road") || metricId.includes("transit") || metricId.includes("poi")) return "transport";
  if (metricId.includes("floor") || metricId.includes("building")) return "building";
  if (metricId === "gsi") return "blocks";
  if (metricId === "bcr") return "layers";
  if (metricId === "far") return "analysis";
  return "chart";
}

function getMetricColor(metricId: string): string {
  if (metricId === "gsi") return "#F59E0B";
  if (metricId === "bcr") return "#EAB308";
  if (metricId.includes("floor")) return "#8B5CF6";
  if (metricId.includes("building")) return "#475569";
  return "#229ED9";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
