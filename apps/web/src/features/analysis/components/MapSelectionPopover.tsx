import type { SelectedMapObject } from "@/store/map";
import { AnalysisIcon } from "./AnalysisIcon";

export function MapSelectionPopover({
  selectedObject,
  onClose,
}: {
  selectedObject: SelectedMapObject | null;
  onClose: () => void;
}) {
  if (!selectedObject) return null;

  const details = Object.entries(selectedObject.properties)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 4);

  return (
    <aside className="absolute right-[328px] top-1/2 z-30 hidden w-[150px] -translate-y-1/2 rounded-[16px] border border-white/70 bg-white/76 p-3 backdrop-blur-3xl lg:block" aria-label="Выбранный объект карты">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] text-[#94A3B8]">Объект</p>
          <h3 className="mt-1 truncate text-[11px] font-semibold">{selectedObject.category || selectedObject.type}</h3>
        </div>
        <button type="button" aria-label="Закрыть сведения об объекте" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-[#64748B] transition hover:bg-white/65 hover:text-[#0F172A]">
          <AnalysisIcon name="close" className="h-4 w-4" />
        </button>
      </div>
      {details.length > 0 ? (
        <dl className="mt-3 space-y-1.5 border-t border-white/75 pt-2.5">
          {details.map(([key, value]) => (
            <div key={key} className="flex min-w-0 items-center justify-between gap-2">
              <dt className="truncate text-[8px] text-[#94A3B8]">{key}</dt>
              <dd className="truncate text-[8px] font-medium text-[#0F172A]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <button type="button" className="mt-3 h-8 w-full rounded-[10px] border border-white/75 bg-white/58 text-[9px] font-semibold text-[#475569]">Подробнее</button>
    </aside>
  );
}
