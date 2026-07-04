"use client";

import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceEnabledByDefault } from "@/lib";
import { getImportSourceLabel } from "@/features/import";
import { useProjectStore } from "@/store/project";
import type { ImportSourceId } from "@/types/formiq";

const text = {
  title: "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0434\u0430\u043d\u043d\u044b\u0445",
  activeOnly: "\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u0440\u0430\u0431\u043e\u0447\u0438\u0435 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438. \u0411\u0443\u0434\u0443\u0449\u0438\u0435 \u043c\u043e\u0434\u0443\u043b\u0438 \u043d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u044e\u0442\u0441\u044f.",
  soon: "\u0441\u043a\u043e\u0440\u043e",
};

export default function DataSourcesPanel() {
  const sources = useProjectStore((state) => state.project.importSettings.sources);
  const setImportSourceEnabled = useProjectStore((state) => state.setImportSourceEnabled);

  return (
    <section className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl">
      <h3 className="text-sm font-bold text-[#111827]">{text.title}</h3>
      <p className="mt-1 text-xs text-[#64748B]">{text.activeOnly}</p>

      <div className="mt-4 space-y-2">
        {DEFAULT_IMPORT_SOURCE_ORDER.map((source) => {
          const isEnabledSource = isImportSourceEnabledByDefault(source);

          return (
            <label
              key={source}
              className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm"
            >
              <span className={isEnabledSource ? "text-[#111827]" : "text-[#9CA3AF]"}>
                {getImportSourceLabel(source)}
              </span>
              <span className="flex items-center gap-2">
                {!isEnabledSource ? (
                  <span className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#64748B]">
                    {text.soon}
                  </span>
                ) : null}
                <input
                  data-testid={`source-toggle-${source}`}
                  type="checkbox"
                  checked={isEnabledSource && sources[source]}
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
