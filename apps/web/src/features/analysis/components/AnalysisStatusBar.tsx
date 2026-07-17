import { AnalysisIcon } from "./AnalysisIcon";

export function AnalysisStatusBar({ sources, updatedAt, scaleLabel, coordinates, coveragePercent, coverageReason }: { sources: string[]; updatedAt: string; scaleLabel: string; coordinates: { longitude: number; latitude: number } | null; coveragePercent?: number; coverageReason?: string | null }) {
  const sourceLabel = sources.length > 0 ? sources.slice(0, 3).join(", ") : "внутренняя модель FORMIQ";
  const date = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(updatedAt));
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-30 hidden h-11 items-center justify-between border-t border-white/70 bg-white/76 px-4 text-[9px] text-[#64748B] backdrop-blur-3xl lg:flex">
      <div className="flex min-w-0 items-center gap-5">
        <span className="truncate">Источники: {sourceLabel}</span>
        {typeof coveragePercent === "number" ? <span title={coverageReason ?? undefined}>Покрытие слоя: {Math.round(coveragePercent)}%</span> : null}
        <span className="h-4 w-px bg-[#CBD5E1]/75" />
        <span className="shrink-0">Дата расчёта: {date}</span>
      </div>
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-2"><span className="h-px w-14 bg-[#64748B]" />{scaleLabel}</span>
        <span className="h-4 w-px bg-[#CBD5E1]/75" />
        <span>{coordinates ? `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}` : "Координаты курсора"}</span>
        <span className="h-4 w-px bg-[#CBD5E1]/75" />
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F1F5F9] text-[#64748B]"><AnalysisIcon name="sliders" className="h-3.5 w-3.5" /></span>
      </div>
    </footer>
  );
}
