"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { WorkspaceModeTabs } from "@/components/layout";
import {
  DataSourcesPanel,
  importUnifiedContextByBoundingBox,
  type ImportProgressEvent,
} from "@/features/import";
import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceEnabledByDefault } from "@/lib";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";
import type { ImportSourceId } from "@/types/formiq";

const text = {
  searchPlaceholder:
    "\u041f\u043e\u0438\u0441\u043a \u0430\u0434\u0440\u0435\u0441\u0430, OSM \u0438 \u0441\u043b\u043e\u0451\u0432 \u0441\u043a\u043e\u0440\u043e \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f",
  importData: "\u0418\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435",
  importing: "\u0418\u043c\u043f\u043e\u0440\u0442...",
  sources: "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438",
  noBounds:
    "\u041d\u0443\u0436\u043d\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044f \u0438\u043b\u0438 \u0432\u044b\u0434\u0435\u043b\u0435\u043d\u0438\u0435.",
  noSources:
    "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a.",
  done:
    "\u0418\u043c\u043f\u043e\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d.",
  importFailed:
    "\u0418\u043c\u043f\u043e\u0440\u0442 \u043d\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d.",
  analysis: "\u0410\u043d\u0430\u043b\u0438\u0437",
  notifications: "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u043f\u043e\u0437\u0436\u0435",
  profileTitle:
    "\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043f\u043e\u0437\u0436\u0435",
  userName: "\u0421\u0435\u0440\u0433\u0435\u0439",
  role: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440",
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
      : Math.round((importLog.filter((event) => event.status !== "loading").length / enabledSources.length) * 100);

  const handleImport = async () => {
    if (isImporting) {
      return;
    }

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
      const result = await importUnifiedContextByBoundingBox(importBounds, {
        sources: enabledSources,
        onProgress: (event) => {
          setImportLog((current) => mergeImportLog(current, event));
        },
      });

      syncProjectFromFusion(result.fusionResult);
      setStatusMessage(text.done);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : text.importFailed);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-white px-8">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <input
          type="text"
          placeholder={text.searchPlaceholder}
          disabled
          className="h-11 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] px-5 text-sm text-[var(--text-light)] outline-none"
        />
        <WorkspaceModeTabs />

        <div className="relative flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-testid="single-import-button"
            onClick={handleImport}
            disabled={isImporting}
            title={importBounds ? text.importData : text.noBounds}
            className="rounded-xl bg-[#229ED9] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1D8CC2] disabled:cursor-not-allowed disabled:bg-[#93C5FD]"
          >
            {isImporting ? text.importing : text.importData}
          </button>

          <button
            type="button"
            data-testid="data-sources-button"
            onClick={() => setIsSourcesPanelOpen((current) => !current)}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:bg-[#F8FAFC]"
          >
            {text.sources}
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
      </div>

      <div className="relative ml-8 flex items-center gap-3">
        <span className="hidden max-w-48 truncate text-xs font-medium text-[#6B7280] lg:inline">
          {isSaving ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435..." : project.name}
        </span>

        <button
          disabled
          title="\u041e\u0442\u0434\u0435\u043b\u044c\u043d\u0430\u044f \u043f\u0430\u043d\u0435\u043b\u044c \u0430\u043d\u0430\u043b\u0438\u0437\u0430 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043f\u043e\u0437\u0436\u0435"
          className="rounded-xl bg-[#BFDBFE] px-5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed"
        >
          {text.analysis}
        </button>

        <button
          disabled
          title={text.notifications}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-lg text-[#9CA3AF] transition disabled:cursor-not-allowed"
        >
          !
        </button>

        <button
          disabled
          title={text.profileTitle}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2 transition disabled:cursor-not-allowed"
        >
          <Image
            src="/logo/icon.png"
            alt="FORMIQ"
            width={34}
            height={34}
          />

          <div className="text-left leading-tight">
            <p className="text-sm font-semibold text-[var(--text)]">{text.userName}</p>
            <p className="text-xs text-[var(--text-light)]">{text.role}</p>
          </div>
        </button>
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
      className="absolute right-0 top-14 z-40 w-96 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl"
    >
      <div className="h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
        <div
          className="h-full bg-[#229ED9] transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {statusMessage ? (
        <p className="mt-3 text-sm font-semibold text-[#111827]">{statusMessage}</p>
      ) : null}

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {events.map((event) => (
          <div
            key={event.source}
            data-testid={`import-log-${event.source}`}
            className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-[#111827]">{event.label}</span>
              <span
                className={
                  event.status === "error"
                    ? "text-[#DC2626]"
                    : event.status === "loading"
                      ? "text-[#D97706]"
                      : "text-[#059669]"
                }
              >
                {event.status}
              </span>
            </div>
            <p className="mt-1 text-[#64748B]">{event.message}</p>
            {event.errorMessage ? (
              <p className="mt-1 text-[#DC2626]">{event.errorMessage}</p>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function mergeImportLog(
  events: ImportProgressEvent[],
  nextEvent: ImportProgressEvent
): ImportProgressEvent[] {
  const nextEvents = events.filter((event) => event.source !== nextEvent.source);
  nextEvents.push(nextEvent);
  return nextEvents;
}
