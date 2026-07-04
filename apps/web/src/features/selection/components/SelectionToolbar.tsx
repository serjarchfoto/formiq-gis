"use client";

import { useSelectionStore } from "@/store/selection";

export default function SelectionToolbar() {
  const mode = useSelectionStore((state) => state.mode);
  const selection = useSelectionStore((state) => state.selection);
  const draftCoordinates = useSelectionStore((state) => state.draftCoordinates);
  const setMode = useSelectionStore((state) => state.setMode);
  const commitPolygon = useSelectionStore((state) => state.commitPolygon);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const hasPolygonDraft = mode === "polygon" && draftCoordinates.length >= 3;

  return (
    <aside className="absolute right-6 top-6 z-20 w-72 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <h2 className="mb-4 text-lg font-bold">Территория</h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode(mode === "rectangle" ? "none" : "rectangle")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            mode === "rectangle"
              ? "border-[#229ED9] bg-[#229ED9] text-white"
              : "border-[#E5E7EB] hover:bg-[#F8FAFC]"
          }`}
        >
          Прямоугольник
        </button>

        <button
          onClick={() => setMode(mode === "polygon" ? "none" : "polygon")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            mode === "polygon"
              ? "border-[#229ED9] bg-[#229ED9] text-white"
              : "border-[#E5E7EB] hover:bg-[#F8FAFC]"
          }`}
        >
          Полигон
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={commitPolygon}
          disabled={!hasPolygonDraft}
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-medium transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Завершить
        </button>

        <button
          onClick={clearSelection}
          disabled={!selection && draftCoordinates.length === 0 && mode === "none"}
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-medium transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Очистить
        </button>
      </div>

      <p className="mt-4 text-xs leading-5 text-[#6B7280]">
        {selection
          ? "Территория выбрана. Можно загружать OSM."
          : mode === "rectangle"
            ? "Зажмите и протяните область на карте."
            : mode === "polygon"
              ? "Кликайте точки контура, затем завершите полигон."
              : "Выберите форму территории."}
      </p>
    </aside>
  );
}
