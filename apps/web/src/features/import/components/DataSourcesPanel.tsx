"use client";

import { getImportSourceLabel } from "@/features/import";
import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceSupported } from "@/lib";
import { useProjectStore } from "@/store/project";
import type { ImportSourceId, SourceSyncState } from "@/types/formiq";

const descriptions: Record<ImportSourceId, string> = {
  osm: "Карта и базовые объекты",
  "microsoft-buildings": "Контуры зданий",
  overture: "Здания и POI",
  "city-geojson": "Городские наборы",
  "local-buildings": "Локальные здания",
  wikidata: "Имена и атрибуты",
  gtfs: "Транспорт",
  "copernicus-dem": "Рельеф",
  "sentinel-2": "Покрытие земли",
  "open-weather": "Погодный слой",
};

export default function DataSourcesPanel() {
  const project = useProjectStore((state) => state.project);
  const sources = project.importSettings.sources;
  const setImportSourceEnabled = useProjectStore((state) => state.setImportSourceEnabled);

  return (
    <section className="absolute right-0 top-14 z-50 w-[340px] rounded-[20px] border border-white/70 bg-white/78 p-4 backdrop-blur-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0F172A]">Источники данных</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
            Активные источники участвуют в импорте выбранной территории.
          </p>
        </div>
        <span className="rounded-full bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1]">
          {DEFAULT_IMPORT_SOURCE_ORDER.filter((source) => sources[source]).length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {DEFAULT_IMPORT_SOURCE_ORDER.map((source) => {
          const isEnabledSource = isImportSourceSupported(source);
          const isTerrainSource = source === "copernicus-dem";
          const isSelected =
            isEnabledSource &&
            sources[source] &&
            (!isTerrainSource || project.importSettings.includeTerrain);
          const sourceState = project.fusion?.sourceStates.find((state) => state.source === source);
          const status = getSourceStatus(isSelected, sourceState?.status);

          return (
            <label
              key={source}
              className="flex items-center justify-between gap-4 rounded-[14px] border border-white/60 bg-white/45 px-3 py-3 text-sm transition duration-200 ease-out hover:-translate-y-0.5"
            >
              <span className="min-w-0">
                <span className={isEnabledSource ? "block truncate font-medium text-[#0F172A]" : "block truncate font-medium text-[#94A3B8]"}>
                  {getImportSourceLabel(source)}
                </span>
                <span className="mt-1 block truncate text-[12px] text-[#64748B]">
                  {descriptions[source]}
                </span>
                {isTerrainSource ? (
                  <span className="mt-1.5 inline-flex rounded-full bg-[#FEF3C7] px-2 py-1 text-[11px] font-semibold text-[#92400E]">
                    Тяжёлый слой · загружается по запросу
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {!isEnabledSource ? (
                  <span className="rounded-full bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#64748B]">
                    скоро
                  </span>
                ) : (
                  <span className={getSourceStatusClass(status)}>{status}</span>
                )}
                <input
                  data-testid={`source-toggle-${source}`}
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isEnabledSource}
                  onChange={(event) =>
                    setImportSourceEnabled(source as ImportSourceId, event.target.checked)
                  }
                  className="h-5 w-5 accent-[#229ED9] disabled:cursor-not-allowed"
                />
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function getSourceStatus(enabled: boolean, status?: SourceSyncState["status"]): string {
  if (!enabled) return "выключен";
  if (status === "ready") return "готово";
  if (status === "not-configured") return "не настроен";
  if (status === "rate-limited") return "лимит";
  if (status === "offline") return "недоступен";
  if (status === "error") return "ошибка";
  if (status === "loading") return "загрузка";
  return "ожидает";
}

function getSourceStatusClass(status: string): string {
  const base = "rounded-full px-2 py-1 text-[11px] font-semibold";

  if (status === "готово") return `${base} bg-[#DCFCE7] text-[#166534]`;
  if (status === "лимит" || status === "недоступен") return `${base} bg-[#FEF3C7] text-[#92400E]`;
  if (status === "не настроен" || status === "выключен") return `${base} bg-[#F1F5F9] text-[#64748B]`;
  if (status === "ошибка") return `${base} bg-[#FEE2E2] text-[#991B1B]`;
  return `${base} bg-[#E0F2FE] text-[#075985]`;
}
