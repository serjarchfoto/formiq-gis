import type { AnalysisLayerDefinition } from "@/features/analysis/registry";
import type { ScenarioModel } from "@/features/analysis/model";
import type { AnalysisStatus } from "@/store/analysis";
import { AnalysisIcon } from "./AnalysisIcon";
import { formatAnalysisDataStatus, getAnalysisStatusColor } from "./analysisDisplay";

export function AnalysisMapToolbar({
  layer,
  scenario,
  analysisStatus,
  viewMode,
  opacity,
  onViewModeChange,
  onOpacityChange,
  onOpenScenarios,
}: {
  layer: AnalysisLayerDefinition;
  scenario: ScenarioModel;
  analysisStatus: AnalysisStatus;
  viewMode: "2d" | "3d";
  opacity: number;
  onViewModeChange: (mode: "2d" | "3d") => void;
  onOpacityChange: (opacity: number) => void;
  onOpenScenarios: () => void;
}) {
  return (
    <section className="absolute left-[408px] right-[318px] top-4 z-30 mx-auto flex h-[72px] max-w-[750px] items-center rounded-[20px] border border-white/70 bg-white/72 px-3 backdrop-blur-3xl max-lg:left-3 max-lg:right-3 max-lg:top-[104px] max-lg:max-w-none">
      <div className="flex min-w-0 flex-[1.35] items-center gap-3 px-1.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#229ED9]/10 text-[#229ED9]">
          <AnalysisIcon name="grid" className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] text-[#94A3B8]">Текущий слой</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="truncate text-[12px] font-semibold">{layer.title}</h2>
            <AnalysisIcon name="chevron-down" className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[9px] text-[#64748B]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: getAnalysisStatusColor(layer.status) }} />
            {analysisStatus === "running" ? "Выполняется расчёт…" : formatAnalysisDataStatus(layer.status)}
          </p>
        </div>
      </div>

      <div className="mx-2 hidden h-10 w-px bg-[#E2E8F0]/80 xl:block" />

      <button type="button" onClick={onOpenScenarios} className="hidden min-w-0 flex-1 items-center gap-2 rounded-[14px] px-2 py-1.5 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/55 xl:flex">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#229ED9]/10 text-[#229ED9]">
          <span className="h-2.5 w-2.5 rounded-full border-[3px] border-[#229ED9]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] text-[#94A3B8]">Сценарий</span>
          <span className="mt-1 block truncate text-[12px] font-semibold">{scenario.title}</span>
        </span>
        <AnalysisIcon name="chevron-down" className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
      </button>

      <div className="mx-2 hidden h-10 w-px bg-[#E2E8F0]/80 xl:block" />

      <label className="hidden w-[170px] shrink-0 px-2 xl:block" title="Прозрачность аналитического слоя">
        <span className="block text-[9px] text-[#94A3B8]">Прозрачность слоя</span>
        <span className="mt-2 flex items-center gap-2.5">
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            aria-label="Прозрачность аналитического слоя"
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            className="h-1 min-w-0 flex-1 accent-[#229ED9]"
          />
          <span className="w-8 text-right text-[10px] font-semibold text-[#475569]">{Math.round(opacity * 100)}%</span>
        </span>
      </label>

      <div className="mx-2 hidden h-10 w-px bg-[#E2E8F0]/80 xl:block" />

      <div className="ml-auto flex shrink-0 rounded-[14px] bg-white/68 p-1">
        <ModeButton label="2D" active={viewMode === "2d"} onClick={() => onViewModeChange("2d")} />
        <ModeButton label="3D" active={viewMode === "3d"} disabled={!layer.visualization.supports3D} onClick={() => onViewModeChange("3d")} />
      </div>
    </section>
  );
}

function ModeButton({ label, active, disabled = false, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? `${label} для этого слоя не поддерживается` : `${label} режим`}
      onClick={onClick}
      className={`h-9 min-w-10 rounded-[11px] px-2.5 text-[12px] font-semibold transition duration-200 ease-out ${
        active ? "bg-[#229ED9] text-white" : "text-[#64748B] hover:bg-white/80 hover:text-[#0F172A]"
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {label}
    </button>
  );
}
