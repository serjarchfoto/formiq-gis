"use client";

import { useProjectStore } from "@/store/project";

const layoutOptions = [
  "Легенда",
  "Северная стрелка",
  "Масштабная линейка",
  "Рамка листа",
  "Белый фон",
];

export default function PresentationPanel() {
  const project = useProjectStore((state) => state.project);
  const activeSources = project.dataSources
    .filter((source) => source.status === "active" && (source.featureCount ?? 0) > 0)
    .map((source) => source.name)
    .slice(0, 4);

  return (
    <aside className="absolute left-6 top-6 z-20 w-[22rem] rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#111827]">Презентация</h2>
        <p className="mt-1 text-xs text-[#64748B]">Оформление планшета и экспортного листа.</p>
      </div>

      <section className="space-y-2">
        {layoutOptions.map((option) => (
          <label
            key={option}
            className="flex items-center justify-between rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          >
            <span className="font-medium text-[#111827]">{option}</span>
            <input type="checkbox" defaultChecked className="h-5 w-5 accent-[#229ED9]" />
          </label>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-bold text-[#111827]">Макет листа</h3>
        <div className="mt-3 aspect-[1.414/1] rounded-lg border border-[#D1D5DB] bg-white p-3 shadow-inner">
          <div className="h-full rounded border border-[#111827]/20 p-3">
            <div className="h-2/3 rounded bg-[#E5E7EB]" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[#6B7280]">
              <span>Проект: {project.name}</span>
              <span>Источники: {activeSources.join(", ") || "FORMIQ"}</span>
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="mt-5 h-10 w-full rounded-xl bg-[#229ED9] text-sm font-semibold text-white transition hover:bg-[#1D8CC2]"
      >
        Экспорт листа
      </button>
    </aside>
  );
}
