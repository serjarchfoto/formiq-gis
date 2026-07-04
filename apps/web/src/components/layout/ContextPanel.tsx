"use client";

import { getCachedAnalysisResult, isThematicMapDefinition } from "@/lib";
import { ExportService } from "@/services/export";
import { useMapStore } from "@/store/map";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";
import { calculatePolygonArea } from "@/utils";

const exportService = new ExportService();

export default function ContextPanel() {
  const project = useProjectStore((state) => state.project);
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt);
  const recordOperation = useProjectStore((state) => state.recordOperation);
  const selection = useSelectionStore((state) => state.selection);
  const thematicMapType = project.settings.display.activeThematicMapType;
  const selectedObject = useMapStore((state) => state.selectedObject);
  const activeTerritory = project.territories.find((territory) => territory.id === project.activeTerritoryId);
  const cachedThematicMap = project.thematicMaps[thematicMapType];
  const thematicMap = isThematicMapDefinition(cachedThematicMap) ? cachedThematicMap : null;
  const analysis = getCachedAnalysisResult(project);

  const handleExportThematicMap = (format: "geojson" | "svg") => {
    if (!thematicMap) {
      return;
    }

    exportService.exportThematicMap(thematicMap, format);
    recordOperation("thematic-map-built", `Тематическая карта экспортирована (${format.toUpperCase()})`, {
      format,
      thematicMap: thematicMap.id,
    });
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Контекст
        </p>
        <h2 className="mt-1 truncate text-lg font-bold text-[#111827]">
          {getPanelTitle(Boolean(selectedObject), Boolean(thematicMap), Boolean(activeTerritory || selection))}
        </h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {selectedObject ? (
          <Section title="Объект">
            <Metric label="ID" value={selectedObject.id} />
            <Metric label="Тип" value={formatEntityType(selectedObject.type)} />
            <Metric label="Категория" value={selectedObject.category} />
          </Section>
        ) : null}

        {thematicMap ? (
          <Section title={thematicMap.title}>
            <p className="text-xs leading-5 text-[#6B7280]">{thematicMap.description}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleExportThematicMap("svg")}
                className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#111827] transition hover:bg-[#F8FAFC]"
              >
                Экспорт SVG
              </button>
              <button
                onClick={() => handleExportThematicMap("geojson")}
                className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#111827] transition hover:bg-[#F8FAFC]"
              >
                Экспорт GeoJSON
              </button>
            </div>
            <div className="space-y-2">
              {thematicMap.legend
                .filter((item) => item.count > 0)
                .map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-xs text-[#374151]">{item.label}</span>
                    </div>
                    <span className="text-xs font-semibold">{item.count.toLocaleString("ru-RU")}</span>
                  </div>
                ))}
            </div>
          </Section>
        ) : null}

        <Section title="Территория">
          <Metric label="Активные территории" value={project.territories.length.toLocaleString("ru-RU")} />
          <Metric
            label="Рабочая зона"
            value={formatArea(
              selection
                ? calculatePolygonArea({ type: "polygon", rings: selection.geometry.geometry.coordinates })
                : (analysis?.territory.area ?? 0)
            )}
          />
          <Metric label="Буфер загрузки" value={`${activeTerritory?.loadingBuffer.distanceMeters ?? project.settings.analysis.defaultBufferMeters} м`} />
          <Metric label="Границы" value={(analysis?.territory.boundaryCount ?? project.boundaries.length).toLocaleString("ru-RU")} />
          <Metric label="POI" value={(analysis?.territory.poiCount ?? project.poi.length).toLocaleString("ru-RU")} />
          <Metric label="Остановки" value={(analysis?.territory.transitStopCount ?? project.transitStops.length).toLocaleString("ru-RU")} />
        </Section>

        <Section title="Проект">
          <Metric label="Здания" value={project.buildings.length.toLocaleString("ru-RU")} />
          <Metric label="Дороги" value={project.roads.length.toLocaleString("ru-RU")} />
          <Metric label="Озеленение" value={project.vegetation.length.toLocaleString("ru-RU")} />
          <Metric label="Вода" value={project.water.length.toLocaleString("ru-RU")} />
          <Metric label="Границы" value={project.boundaries.length.toLocaleString("ru-RU")} />
          <Metric label="POI" value={project.poi.length.toLocaleString("ru-RU")} />
          <Metric label="Остановки" value={project.transitStops.length.toLocaleString("ru-RU")} />
          <Metric label="Режим" value={formatWorkspaceMode(project.settings.display.workspaceMode)} />
          <Metric label="Сохранено" value={lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString("ru-RU") : "Пока нет"} />
        </Section>

        <Section title="История">
          <div className="space-y-2">
            {project.history.slice(0, 6).map((operation) => (
              <div key={operation.id} className="rounded-xl border border-[#E5E7EB] px-3 py-2">
                <p className="text-xs font-semibold text-[#111827]">{formatOperationLabel(operation.type)}</p>
                <p className="mt-1 text-[11px] text-[#9CA3AF]">
                  {new Date(operation.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#E5E7EB] p-4">
      <h3 className="text-sm font-bold text-[#111827]">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-[#6B7280]">{label}</span>
      <span className="truncate font-semibold text-[#111827]">{value}</span>
    </div>
  );
}

function getPanelTitle(hasObject: boolean, hasTheme: boolean, hasTerritory: boolean): string {
  if (hasObject) return "Свойства объекта";
  if (hasTheme) return "Тематическая карта";
  if (hasTerritory) return "Анализ территории";
  return "Обзор проекта";
}

function formatArea(valueSqM: number): string {
  if (valueSqM >= 1_000_000) {
    return `${(valueSqM / 1_000_000).toFixed(2)} км²`;
  }

  return `${Math.round(valueSqM).toLocaleString("ru-RU")} м²`;
}

function formatWorkspaceMode(mode: string): string {
  const labels: Record<string, string> = {
    architecture: "Архитектура",
    analysis: "Анализ",
    presentation: "Презентация",
    "3d": "3D",
  };

  return labels[mode] ?? mode;
}

function formatEntityType(type: string): string {
  const labels: Record<string, string> = {
    building: "Здание",
    road: "Дорога",
    vegetation: "Озеленение",
    water: "Вода",
    terrain: "Рельеф",
    boundary: "Граница",
    poi: "POI",
    "transit-stop": "Остановка",
  };

  return labels[type] ?? type;
}

function formatOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    "project-created": "Проект создан",
    "project-opened": "Проект открыт",
    "territory-created": "Территория создана",
    "territory-updated": "Территория обновлена",
    "territory-activated": "Территория активирована",
    "data-imported": "Данные импортированы",
    "analysis-built": "Анализ сформирован",
    "thematic-map-built": "Тематическая карта сформирована",
    "workspace-mode-changed": "Режим рабочего пространства изменен",
    "project-settings-updated": "Параметры карты обновлены",
  };

  return labels[type] ?? type;
}
