"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DataSourcesPanel,
  getImportStageCount,
  importUnifiedContextByBoundingBox,
  type ImportProgressEvent,
} from "@/features/import";
import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceEnabledByDefault } from "@/lib";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";
import type { ImportSourceId } from "@/types/formiq";

const text = {
  mode: "Архитектура",
  searchPlaceholder: "Поиск адреса или объекта",
  importTerritory: "Импортировать территорию",
  importing: "Импорт...",
  sources: "Источники данных",
  noBounds: "Сначала выберите территорию на карте.",
  noSources: "Включите хотя бы один источник.",
  done: "Импорт завершен.",
  importFailed: "Импорт не завершен.",
  saving: "Сохранение...",
  account: "Аккаунт",
  settings: "Настройки",
  notifications: "Уведомления",
  help: "Справка",
};

export default function TopBar() {
  const project = useProjectStore((state) => state.project);
  const isSaving = useProjectStore((state) => state.isSaving);
  const syncProjectFromFusion = useProjectStore((state) => state.syncProjectFromFusion);
  const selection = useSelectionStore((state) => state.selection);
  const [isImporting, setIsImporting] = useState(false);
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false);
  const [importLog, setImportLog] = useState<ImportProgressEvent[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const activeTerritory = project.territories.find(
    (territory) => territory.id === project.activeTerritoryId
  );
  const importBounds = activeTerritory?.loadingBuffer.bounds ?? selection?.bounds ?? null;
  const enabledSources = useMemo(
    () =>
      DEFAULT_IMPORT_SOURCE_ORDER.filter(
        (source): source is ImportSourceId =>
          isImportSourceEnabledByDefault(source) && project.importSettings.sources[source]
      ),
    [project.importSettings.sources]
  );
  const progressPercent =
    enabledSources.length === 0
      ? 0
      : Math.round(
          (importLog.filter((event) => event.status !== "loading").length /
            getImportStageCount(enabledSources)) *
            100
        );

  const handleImport = async () => {
    if (isImporting) return;

    if (!importBounds) {
      setStatusMessage(text.noBounds);
      setImportLog([]);
      return;
    }

    if (enabledSources.length === 0) {
      setStatusMessage(text.noSources);
      setImportLog([]);
      return;
    }

    setIsImporting(true);
    setStatusMessage("");
    setImportLog([]);

    try {
      await importUnifiedContextByBoundingBox(importBounds, {
        sources: enabledSources,
        onProgress: (event) => setImportLog((current) => mergeImportLog(current, event)),
        onProjectUpdate: syncProjectFromFusion,
      });

      setStatusMessage(text.done);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : text.importFailed);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <header className="absolute left-6 right-6 top-6 z-30 flex h-14 items-center justify-between gap-4 rounded-[20px] border border-white/70 bg-white/62 px-3 backdrop-blur-3xl max-lg:left-4 max-lg:right-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden h-10 items-center rounded-[14px] bg-white/50 px-4 text-sm font-semibold text-[#0F172A] xl:flex">
          {text.mode}
        </span>
        <label className="relative hidden md:block">
          <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]" name="search" />
          <input
            placeholder={text.searchPlaceholder}
            className="h-11 w-[360px] rounded-[14px] border border-white/70 bg-white/62 pl-11 pr-4 text-sm outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60"
          />
        </label>
      </div>

      <div className="relative flex min-w-0 items-center gap-2">
        <span className="hidden max-w-44 truncate text-[13px] font-medium text-[#64748B] lg:inline">
          {isSaving ? text.saving : project.name}
        </span>
        <button
          type="button"
          data-testid="single-import-button"
          onClick={handleImport}
          disabled={isImporting}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#229ED9] px-4 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Icon name="download" />
          {isImporting ? text.importing : text.importTerritory}
        </button>
        <button
          type="button"
          data-testid="data-sources-button"
          onClick={() => setIsSourcesPanelOpen((current) => !current)}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] border border-white/70 bg-white/62 px-4 text-sm font-semibold backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5"
        >
          <Icon name="database" />
          <span className="hidden sm:inline">{text.sources}</span>
        </button>

        {isSourcesPanelOpen ? <DataSourcesPanel /> : null}
        {isImporting || importLog.length > 0 || statusMessage ? (
          <ImportProgressPopover
            progressPercent={progressPercent}
            events={importLog}
            statusMessage={statusMessage}
          />
        ) : null}
      </div>
    </header>
  );
}

function ImportProgressPopover({
  progressPercent,
  events,
  statusMessage,
}: {
  progressPercent: number;
  events: ImportProgressEvent[];
  statusMessage: string;
}) {
  return (
    <aside
      data-testid="import-progress-popover"
      className="absolute right-0 top-14 z-40 w-96 rounded-[20px] border border-white/70 bg-white/78 p-4 text-sm backdrop-blur-3xl"
    >
      <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
        <div className="h-full bg-[#229ED9] transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {statusMessage ? <p className="mt-3 font-semibold text-[#0F172A]">{statusMessage}</p> : null}

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {events.map((event) => (
          <div key={event.source} className="rounded-[14px] border border-white/70 bg-white/50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-[#0F172A]">{event.label}</span>
              <span className="text-[12px] text-[#64748B]">{formatStatus(event.status)}</span>
            </div>
            <p className="mt-1 text-[12px] text-[#64748B]">{event.message}</p>
            {event.status === "error" && event.errorMessage ? (
              <p className="mt-1 text-[12px] text-[#EF4444]">{event.errorMessage}</p>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

type IconName = "bell" | "chevron" | "database" | "download" | "help" | "search" | "settings";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    bell: <path d="M6 16h12l-2-3V9a4 4 0 0 0-8 0v4l-2 3Zm4 3h4" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    database: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />,
    download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />,
    help: <path d="M9.1 9a3 3 0 1 1 5.8 1c-.4 1.2-1.6 1.8-2.4 2.6-.4.4-.5.8-.5 1.4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    search: <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M1 12h3m16 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />,
  };

  return (
    <svg
      className={`h-4 w-4 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function formatStatus(status: ImportProgressEvent["status"]): string {
  const labels: Record<ImportProgressEvent["status"], string> = {
    ready: "готово",
    loading: "загрузка",
    "not-configured": "не настроен",
    "rate-limited": "лимит",
    offline: "недоступен",
    error: "ошибка",
  };

  return labels[status] ?? status;
}

function mergeImportLog(
  events: ImportProgressEvent[],
  nextEvent: ImportProgressEvent
): ImportProgressEvent[] {
  const nextEvents = events.filter((event) => event.source !== nextEvent.source);
  nextEvents.push(nextEvent);
  return nextEvents;
}
