import type { AnalysisScenarioId, ScenarioModel } from "@/features/analysis/model";
import type {
  AnalysisLayerDefinition,
  AnalysisLayerId,
  AnalysisLegendViewModel,
  AnalysisMetricViewModel,
} from "@/features/analysis/registry";
import { AnalysisIcon, type AnalysisIconName } from "./AnalysisIcon";
import { formatAnalysisDataStatus, getAnalysisStatusColor } from "./analysisDisplay";

export type MobileAnalysisTab = "layers" | "metrics" | "scenarios" | "legend";

export function MobileAnalysisDock({
  activeTab,
  collapsed,
  layers,
  activeLayer,
  metrics,
  scenarios,
  activeScenarioId,
  legend,
  onTabChange,
  onCollapsedChange,
  onLayerChange,
  onScenarioChange,
  onCompleteAnalysis,
}: {
  activeTab: MobileAnalysisTab;
  collapsed: boolean;
  layers: AnalysisLayerDefinition[];
  activeLayer: AnalysisLayerDefinition;
  metrics: AnalysisMetricViewModel[];
  scenarios: ScenarioModel[];
  activeScenarioId: AnalysisScenarioId;
  legend: AnalysisLegendViewModel;
  onTabChange: (tab: MobileAnalysisTab) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onLayerChange: (id: AnalysisLayerId) => void;
  onScenarioChange: (id: AnalysisScenarioId) => void;
  onCompleteAnalysis: () => void;
}) {
  if (collapsed) {
    return (
      <button type="button" onClick={() => onCollapsedChange(false)} className="absolute bottom-3 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-[16px] border border-white/70 bg-white/62 px-4 text-[13px] font-semibold backdrop-blur-3xl lg:hidden">
        <AnalysisIcon name="analysis" className="h-[18px] w-[18px] text-[#229ED9]" />
        Открыть анализ
      </button>
    );
  }

  return (
    <aside className="absolute bottom-3 left-3 right-3 z-30 flex max-h-[44vh] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/62 backdrop-blur-3xl lg:hidden" aria-label="Мобильная панель анализа">
      <header className="flex items-center gap-2 border-b border-white/75 px-3 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getAnalysisStatusColor(activeLayer.status) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{activeLayer.title}</p>
          <p className="truncate text-[10px] text-[#64748B]">{formatAnalysisDataStatus(activeLayer.status)}</p>
        </div>
        <button type="button" onClick={() => onCollapsedChange(true)} aria-label="Свернуть панель анализа" className="grid h-8 w-8 place-items-center rounded-[12px] text-[#64748B]">
          <AnalysisIcon name="minus" className="h-4 w-4" />
        </button>
      </header>

      <nav className="grid grid-cols-4 gap-1 border-b border-white/75 p-2" aria-label="Разделы анализа">
        <DockTab id="layers" label="Слои" icon="layers" active={activeTab === "layers"} onClick={onTabChange} />
        <DockTab id="metrics" label="Метрики" icon="chart" active={activeTab === "metrics"} onClick={onTabChange} />
        <DockTab id="scenarios" label="Сценарии" icon="compare" active={activeTab === "scenarios"} onClick={onTabChange} />
        <DockTab id="legend" label="Легенда" icon="map" active={activeTab === "legend"} onClick={onTabChange} />
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {activeTab === "layers" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {layers.map((layer) => (
              <button key={layer.id} type="button" onClick={() => onLayerChange(layer.id)} aria-pressed={layer.id === activeLayer.id} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] border px-2 py-2.5 text-center transition ${layer.id === activeLayer.id ? "border-[#229ED9]/30 bg-[#229ED9]/10 text-[#167EAF]" : "border-white/70 bg-white/45 text-[#64748B]"}`}>
                <AnalysisIcon name={resolveLayerIcon(layer.icon)} className="h-[18px] w-[18px]" />
                <span className="w-full truncate text-[10px] font-semibold">{layer.shortTitle}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === "metrics" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.slice(0, 6).map((metric) => (
              <article key={metric.id} className="min-w-0 rounded-[14px] border border-white/70 bg-white/45 p-3">
                <p className="truncate text-[10px] text-[#64748B]">{metric.label}</p>
                <p className="mt-1 truncate text-[18px] font-semibold">{metric.state === "ready" ? metric.value : "Нет данных"}{metric.state === "ready" && metric.unit ? <span className="ml-1 text-[10px]">{metric.unit}</span> : null}</p>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === "scenarios" ? (
          <div className="space-y-1.5">
            {scenarios.map((scenario) => (
              <button key={scenario.id} type="button" onClick={() => onScenarioChange(scenario.id)} aria-pressed={scenario.id === activeScenarioId} className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-2 text-left ${scenario.id === activeScenarioId ? "border-[#229ED9]/30 bg-[#229ED9]/10" : "border-white/70 bg-white/45"}`}>
                <span className="h-7 w-1 rounded-full" style={{ backgroundColor: scenario.color }} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{scenario.title}</span><span className="block truncate text-[10px] text-[#64748B]">{scenario.subtitle}</span></span>
              </button>
            ))}
            <button type="button" onClick={onCompleteAnalysis} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[14px] bg-[#229ED9] text-[12px] font-semibold text-white">
              <AnalysisIcon name="analysis" className="h-4 w-4" /> Завершить анализ
            </button>
          </div>
        ) : null}

        {activeTab === "legend" ? (
          legend.state === "ready" ? (
            <div className="grid grid-cols-2 gap-2">
              {legend.categories.map((category) => (
                <div key={category.key} className="flex min-w-0 items-center gap-2 rounded-[12px] border border-white/70 bg-white/45 px-3 py-2 text-[10px] text-[#64748B]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ backgroundColor: category.color }} />
                  <span className="truncate">{category.label}</span>
                  {category.count !== undefined ? <span className="ml-auto text-[#0F172A]">{category.count}</span> : null}
                </div>
              ))}
            </div>
          ) : <p className="rounded-[14px] border border-white/70 bg-white/45 p-3 text-[12px] text-[#64748B]">Для выбранного слоя легенда пока недоступна.</p>
        ) : null}
      </div>
    </aside>
  );
}

function DockTab({ id, label, icon, active, onClick }: { id: MobileAnalysisTab; label: string; icon: AnalysisIconName; active: boolean; onClick: (id: MobileAnalysisTab) => void }) {
  return (
    <button type="button" onClick={() => onClick(id)} aria-pressed={active} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2 text-[10px] font-semibold ${active ? "bg-[#229ED9] text-white" : "text-[#64748B]"}`}>
      <AnalysisIcon name={icon} className="h-4 w-4" /><span className="truncate">{label}</span>
    </button>
  );
}

function resolveLayerIcon(icon: AnalysisLayerDefinition["icon"]): AnalysisIconName {
  return icon === "noise" ? "chart" : icon;
}
