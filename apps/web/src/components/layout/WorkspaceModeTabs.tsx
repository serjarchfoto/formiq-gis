"use client";

import { useProjectStore } from "@/store/project";
import type { ProjectWorkspaceMode } from "@/types/formiq";

const MODES: Array<{ id: ProjectWorkspaceMode; label: string }> = [
  { id: "architecture", label: "Архитектура" },
  { id: "analysis", label: "Анализ" },
  { id: "presentation", label: "Презентация" },
  { id: "3d", label: "3D" },
];

export default function WorkspaceModeTabs() {
  const mode = useProjectStore((state) => state.project.settings.display.workspaceMode);
  const setWorkspaceMode = useProjectStore((state) => state.setWorkspaceMode);

  return (
    <div className="flex rounded-xl border border-[var(--border)] bg-[var(--background)] p-1">
      {MODES.map((item) => (
        <button
          key={item.id}
          data-testid={`workspace-mode-${item.id}`}
          onClick={() => setWorkspaceMode(item.id)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            mode === item.id
              ? "bg-white text-[#111827] shadow-sm"
              : "text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
