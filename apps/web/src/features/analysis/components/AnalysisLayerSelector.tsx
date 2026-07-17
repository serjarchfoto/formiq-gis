import type { AnalysisLayerDefinition, AnalysisLayerId } from "@/features/analysis/registry";
import { AnalysisIcon, type AnalysisIconName } from "./AnalysisIcon";

interface NavigationEntry {
  key: string;
  label: string;
  icon: AnalysisIconName;
  layerId?: AnalysisLayerId;
  action?: "overview" | "scenarios";
}

const navigationEntries: NavigationEntry[] = [
  { key: "overview", label: "Обзор", icon: "map", action: "overview" },
  { key: "metrics", label: "Показатели", icon: "analysis", layerId: "built-density" },
  { key: "age", label: "Возраст", icon: "building", layerId: "building-age" },
  { key: "density", label: "Плотность", icon: "grid", layerId: "floor-count" },
  { key: "functions", label: "Функции", icon: "blocks", layerId: "building-function" },
  { key: "transport", label: "Транспорт", icon: "transport", layerId: "poi-transit" },
  { key: "greenery", label: "Зелень", icon: "map", layerId: "greenery" },
  { key: "water", label: "Вода", icon: "layers", layerId: "water" },
  { key: "terrain", label: "Рельеф", icon: "map", layerId: "terrain" },
  { key: "scenarios", label: "Сценарии", icon: "compare", action: "scenarios" },
  { key: "roads", label: "Дороги", icon: "transport", layerId: "roads" },
];

export function AnalysisLayerSelector({
  layers,
  activeLayerId,
  collapsed,
  onChange,
  onOverview,
  onOpenScenarios,
  onCollapsedChange,
}: {
  layers: AnalysisLayerDefinition[];
  activeLayerId: AnalysisLayerId;
  collapsed: boolean;
  onChange: (id: AnalysisLayerId) => void;
  onOverview: () => void;
  onOpenScenarios: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const readyIds = new Set(layers.map((layer) => layer.id));

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Открыть навигацию аналитических слоёв"
        title="Аналитические слои"
        onClick={() => onCollapsedChange(false)}
        className="absolute bottom-[58px] left-4 z-30 hidden h-12 w-12 place-items-center rounded-[18px] border border-white/70 bg-white/68 text-[#229ED9] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/82 lg:grid"
      >
        <AnalysisIcon name="layers" />
      </button>
    );
  }

  return (
    <aside className="absolute bottom-[58px] left-4 top-4 z-30 hidden w-[100px] flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/68 py-2 backdrop-blur-3xl lg:flex" aria-label="Разделы анализа">
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:none]">
        {navigationEntries.map((entry) => {
          const available = !entry.layerId || readyIds.has(entry.layerId);
          const active = entry.key === "metrics" && activeLayerId === "built-density"
            ? true
            : entry.layerId === activeLayerId && entry.key !== "metrics";

          return (
            <button
              key={entry.key}
              type="button"
              disabled={!available}
              data-testid={entry.layerId ? `analysis-layer-${entry.layerId}` : `analysis-nav-${entry.key}`}
              aria-pressed={active}
              title={entry.label}
              onClick={() => {
                if (entry.layerId) onChange(entry.layerId);
                if (entry.action === "overview") onOverview();
                if (entry.action === "scenarios") onOpenScenarios();
              }}
              className={`relative flex h-[56px] w-full flex-col items-center justify-center gap-1 rounded-[14px] text-[10px] font-medium transition duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 ${
                active ? "bg-[#229ED9]/8 text-[#229ED9]" : "text-[#64748B] hover:bg-white/60 hover:text-[#0F172A]"
              }`}
            >
              {active ? <span className="absolute -left-2 h-10 w-0.5 rounded-full bg-[#229ED9]" /> : null}
              <AnalysisIcon name={entry.icon} className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate px-1">{entry.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        className="mx-3 mt-1 flex h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-[#F1F5F9]/90 text-[9px] font-medium text-[#64748B] transition duration-200 ease-out hover:-translate-y-0.5"
      >
        <AnalysisIcon name="chevron-left" className="h-4 w-4" />
        Свернуть
      </button>
    </aside>
  );
}
