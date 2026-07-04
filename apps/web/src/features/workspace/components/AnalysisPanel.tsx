"use client";

import { getCachedAnalysisResult, ThematicMapEngine, type ThematicMapType } from "@/lib";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";

const thematicMapOptions = new ThematicMapEngine().getOptions();

const plannedMetrics = [
  { id: "far", label: "FAR", value: "общая площадь / участок" },
  { id: "gsi", label: "GSI", value: "пятно застройки" },
  { id: "density", label: "Плотность", value: "объекты / га" },
  { id: "sun", label: "Инсоляция", value: "скоро" },
  { id: "noise", label: "Шум", value: "скоро" },
];

export default function AnalysisPanel() {
  const project = useProjectStore((state) => state.project);
  const setThematicMapType = useUIStore((state) => state.setThematicMapType);
  const result = getCachedAnalysisResult(project);
  const status = result ? "complete" : "idle";
  const buildingFootprintPercent = result?.buildings.footprintPercent ?? 0;

  return (
    <aside className="absolute left-6 top-6 z-20 max-h-[calc(100%-3rem)] w-[22rem] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#111827]">Анализ</h2>
          <p className="mt-1 text-xs text-[#64748B]">Тематические карты и базовые показатели проекта.</p>
        </div>
        <span className="rounded-md bg-[#EAF6FC] px-2 py-1 text-[11px] font-semibold text-[#1D8CC2]">
          {formatStatus(status)}
        </span>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[#111827]">Тематическая карта</h3>
        <select
          value={project.settings.display.activeThematicMapType}
          onChange={(event) => setThematicMapType(event.target.value as ThematicMapType)}
          className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9]"
        >
          <option value="none">Нет</option>
          {thematicMapOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>

        <div className="h-10 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#64748B]">
          {result ? "Анализ загружен из кэша" : "Нет кэша анализа"}
        </div>
      </section>

      <section className="mt-5 space-y-2 border-t border-[#E5E7EB] pt-4">
        <h3 className="text-sm font-bold text-[#111827]">Показатели</h3>
        <Metric label="Здания" value={project.buildings.length.toLocaleString("ru-RU")} />
        <Metric label="Пятно застройки" value={`${buildingFootprintPercent.toFixed(1)}%`} />
        <Metric label="Дороги" value={formatLength(result?.roads.totalLength ?? 0)} />
        <Metric label="Озеленение" value={`${(result?.vegetation.territoryPercent ?? 0).toFixed(1)}%`} />
        <Metric label="Вода" value={`${(result?.water.territoryPercent ?? 0).toFixed(1)}%`} />
      </section>

      <section className="mt-5 space-y-2 border-t border-[#E5E7EB] pt-4">
        <h3 className="text-sm font-bold text-[#111827]">Сценарии</h3>
        {plannedMetrics.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.value === "скоро"}
            className="flex w-full items-center justify-between rounded-xl border border-[#E5E7EB] px-3 py-2 text-left text-sm transition enabled:hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="font-semibold text-[#111827]">{item.label}</span>
            <span className="text-xs text-[#64748B]">{item.value}</span>
          </button>
        ))}
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm">
      <span className="text-[#6B7280]">{label}</span>
      <span className="font-semibold text-[#111827]">{value}</span>
    </div>
  );
}

function formatStatus(status: string): string {
  if (status === "running") return "расчёт";
  if (status === "complete") return "готово";
  if (status === "error") return "ошибка";
  return "ожидание";
}

function formatLength(valueM: number): string {
  if (valueM >= 1_000) {
    return `${(valueM / 1_000).toFixed(1)} км`;
  }

  return `${Math.round(valueM).toLocaleString("ru-RU")} м`;
}
