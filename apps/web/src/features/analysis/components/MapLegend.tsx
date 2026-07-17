import type { AnalysisLegendViewModel } from "@/features/analysis/registry";
import { AnalysisIcon } from "./AnalysisIcon";

export function MapLegend({ legend }: { legend: AnalysisLegendViewModel }) {
  const colors = legend.categories.map((category) => category.color);
  const gradient = colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : colors[0] ?? "#CBD5E1";

  return (
    <aside className="absolute bottom-[211px] left-[470px] z-20 hidden h-[105px] w-[310px] overflow-hidden rounded-[18px] border border-white/70 bg-white/72 p-4 backdrop-blur-3xl lg:block" data-legend-state={legend.state} aria-label={`Легенда ${legend.title}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-semibold">Легенда {legend.title.toLocaleLowerCase("ru-RU")}</h3>
          <p className="mt-1 text-[9px] text-[#64748B]">{legend.title.includes("Плотность") ? "FAR" : "Тематическая шкала"}</p>
        </div>
        <AnalysisIcon name="info" className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
      </div>
      {legend.state === "ready" && colors.length > 0 ? (
        <>
          <div className="mt-3 h-2.5 rounded-full" style={{ background: gradient }} />
          <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-[#475569]">
            {legend.categories.slice(0, 5).map((category) => <span key={category.key} className="min-w-0 truncate">{category.label}</span>)}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[10px] text-[#64748B]">Для выбранного слоя легенда пока недоступна.</p>
      )}
    </aside>
  );
}
