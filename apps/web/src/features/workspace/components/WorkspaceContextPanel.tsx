"use client";

import { ContextPanel } from "@/components/layout";
import { getCachedAnalysisResult } from "@/lib";
import { useProjectStore } from "@/store/project";

export default function WorkspaceContextPanel() {
  const mode = useProjectStore((state) => state.project.settings.display.workspaceMode);
  const project = useProjectStore((state) => state.project);
  const analysis = getCachedAnalysisResult(project);
  const status = analysis ? "complete" : "idle";

  if (mode === "analysis") {
    return (
      <Panel title="Аналитика">
        <Metric label="Статус" value={formatStatus(status)} />
        <Metric label="Здания" value={(analysis?.buildings.count ?? project.buildings.length).toLocaleString("ru-RU")} />
        <Metric label="Пятно застройки" value={`${(analysis?.buildings.footprintPercent ?? 0).toFixed(1)}%`} />
        <Metric label="Дорожная сеть" value={formatLength(analysis?.roads.totalLength ?? 0)} />
        <Metric label="Озеленение" value={`${(analysis?.vegetation.territoryPercent ?? 0).toFixed(1)}%`} />
        <LegendHint />
      </Panel>
    );
  }

  if (mode === "presentation") {
    return (
      <Panel title="Предпросмотр">
        <Metric label="Проект" value={project.name} />
        <Metric label="Объекты" value={getObjectCount(project).toLocaleString("ru-RU")} />
        <Metric label="Источники" value={project.dataSources.filter((source) => source.status === "active").length.toLocaleString("ru-RU")} />
        <Metric label="Формат" value="A3 / SVG / PDF" />
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-xs text-[#64748B]">
          На экспорте активны легенда, масштаб, северная стрелка и атрибуция проекта.
        </div>
      </Panel>
    );
  }

  if (mode === "3d") {
    return (
      <Panel title="3D инструменты">
        <Metric label="Pitch" value="60°" />
        <Metric label="Bearing" value="0°" />
        <Metric label="White Model" value={project.whiteModel.status === "generated" ? "готово" : "черновик"} />
        <Metric label="Semantic 3D" value={project.semantic3D.status === "generated" ? "готово" : "не создан"} />
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-xs text-[#64748B]">
          Карта остаётся MapLibre, но переводится в изометрию. Полноценная Three.js-сцена подключается следующим этапом.
        </div>
      </Panel>
    );
  }

  return <ContextPanel />;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Контекст</p>
        <h2 className="mt-1 truncate text-lg font-bold text-[#111827]">{title}</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] px-4 py-3 text-xs">
      <span className="text-[#6B7280]">{label}</span>
      <span className="truncate font-semibold text-[#111827]">{value}</span>
    </div>
  );
}

function LegendHint() {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-xs text-[#64748B]">
      Легенда берётся из активной тематической карты и обновляется при смене анализа.
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

function getObjectCount(project: ReturnType<typeof useProjectStore.getState>["project"]): number {
  return (
    project.buildings.length +
    project.roads.length +
    project.vegetation.length +
    project.water.length +
    project.boundaries.length +
    project.poi.length +
    project.transitStops.length
  );
}
