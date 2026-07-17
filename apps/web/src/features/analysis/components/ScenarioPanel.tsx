import type { AnalysisScenarioId, ScenarioModel, projectScenario } from "@/features/analysis/model";
import { AnalysisIcon } from "./AnalysisIcon";
import { formatAnalysisNumber } from "./analysisDisplay";

type ScenarioProjection = ReturnType<typeof projectScenario>;

export function ScenarioPanel({
  scenarios,
  activeScenarioId,
  compareScenarioId,
  activeProjection,
  compareProjection,
  comparisonMode,
  collapsed,
  onActiveChange,
  onCompareChange,
  onComparisonModeChange,
  onCollapsedChange,
  onCompleteAnalysis,
}: {
  scenarios: ScenarioModel[];
  activeScenarioId: AnalysisScenarioId;
  compareScenarioId: AnalysisScenarioId;
  activeProjection: ScenarioProjection;
  compareProjection: ScenarioProjection;
  comparisonMode: "off" | "difference" | "split";
  collapsed: boolean;
  onActiveChange: (id: AnalysisScenarioId) => void;
  onCompareChange: (id: AnalysisScenarioId) => void;
  onComparisonModeChange: (mode: "off" | "difference" | "split") => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onCompleteAnalysis: () => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Открыть панель сценариев"
        onClick={() => onCollapsedChange(false)}
        className="absolute right-4 top-[145px] z-30 hidden h-12 items-center gap-2 rounded-[18px] border border-white/70 bg-white/72 px-4 text-[13px] font-semibold backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 lg:flex"
      >
        <AnalysisIcon name="compare" className="h-[18px] w-[18px] text-[#229ED9]" />
        Сценарии
      </button>
    );
  }

  return (
    <aside className="absolute bottom-[210px] right-4 top-[145px] z-30 hidden w-[292px] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/72 backdrop-blur-3xl lg:flex" aria-label="Сценарии анализа">
      <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-white/75 px-3.5">
        <h2 className="text-[13px] font-semibold">Сценарии</h2>
        <button
          type="button"
          disabled
          title="Создание пользовательских сценариев запланировано на этап 6"
          className="flex h-8 items-center gap-1.5 rounded-[12px] border border-white/75 bg-white/60 px-2.5 text-[10px] font-medium text-[#64748B] disabled:cursor-not-allowed"
        >
          <AnalysisIcon name="plus" className="h-3.5 w-3.5 text-[#229ED9]" />
          Новый сценарий
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1 [scrollbar-width:thin]">
        {scenarios.map((scenario) => {
          const active = scenario.id === activeScenarioId;
          const compared = scenario.id === compareScenarioId;
          return (
            <div key={scenario.id} className="flex items-center gap-1 border-b border-[#E2E8F0]/65 last:border-b-0">
              <button
                type="button"
                data-testid={`analysis-scenario-${scenario.id}`}
                aria-pressed={active}
                onClick={() => onActiveChange(scenario.id)}
                className="relative flex h-[45px] min-w-0 flex-1 items-center gap-3 px-2 text-left transition duration-200 ease-out hover:bg-white/45"
              >
                <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full" style={{ backgroundColor: scenario.color }} />
                <span className="min-w-0 flex-1 pl-1.5">
                  <span className="block truncate text-[11px] font-semibold">{scenario.title}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-[#64748B]">{scenario.subtitle}</span>
                </span>
                <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${active ? "border-[#229ED9] bg-[#229ED9]" : "border-[#B8C4D4]"}`}>
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
              </button>
              {comparisonMode !== "off" ? (
                <button
                  type="button"
                  aria-label={`Сравнить со сценарием ${scenario.title}`}
                  aria-pressed={compared}
                  onClick={() => onCompareChange(scenario.id)}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-[11px] ${compared ? "bg-[#229ED9]/10 text-[#229ED9]" : "text-[#94A3B8]"}`}
                >
                  <AnalysisIcon name="compare" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 border-t border-white/75 p-3">
        <button
          type="button"
          onClick={() => onComparisonModeChange(comparisonMode === "off" ? "difference" : "off")}
          className={`flex h-9 w-full items-center justify-center gap-2 rounded-[12px] border text-[11px] font-semibold transition duration-200 ease-out hover:-translate-y-0.5 ${comparisonMode === "off" ? "border-white/75 bg-white/58" : "border-[#229ED9]/30 bg-[#229ED9]/10 text-[#167EAF]"}`}
        >
          <AnalysisIcon name="compare" className="h-4 w-4" />
          {comparisonMode === "off" ? "Сравнить сценарии" : "Сравнение включено"}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <ProjectionMetric label="FAR" current={activeProjection.far} compared={compareProjection.far} comparison={comparisonMode !== "off"} />
          <ProjectionMetric label="GSI" current={activeProjection.gsi} compared={compareProjection.gsi} comparison={comparisonMode !== "off"} suffix="%" />
          <ProjectionMetric label="KPI" current={activeProjection.score} compared={compareProjection.score} comparison={comparisonMode !== "off"} />
        </div>
        <button type="button" onClick={onCompleteAnalysis} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#229ED9] text-[11px] font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5">
          <AnalysisIcon name="analysis" className="h-4 w-4" />
          Завершить анализ
        </button>
      </footer>
    </aside>
  );
}

function ProjectionMetric({ label, current, compared, comparison, suffix = "" }: { label: string; current: number; compared: number; comparison: boolean; suffix?: string }) {
  const value = comparison ? compared : current;
  const delta = comparison ? compared - current : 0;
  return (
    <div className="min-w-0 rounded-[12px] border border-white/75 bg-white/52 px-2 py-2">
      <p className="text-[9px] text-[#64748B]">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold">{formatAnalysisNumber(value)}{suffix}</p>
      <p className={`mt-1 truncate text-[9px] font-semibold ${delta >= 0 ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
        {delta >= 0 ? "+" : ""}{formatAnalysisNumber(delta)}{suffix}
      </p>
    </div>
  );
}
