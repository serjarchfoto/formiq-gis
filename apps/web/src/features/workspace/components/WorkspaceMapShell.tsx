"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Map from "@/components/map";
import CartographicLayoutOverlay from "@/components/map/CartographicLayoutOverlay";
import TopBar from "@/components/topbar";
import LayersPanel from "@/features/layers";
import SelectionToolbar from "@/features/selection";
import { useProjectStore } from "@/store/project";
import type { ProjectWorkspaceMode } from "@/types/formiq";
import ThreeDPanel from "./ThreeDPanel";

export default function WorkspaceMapShell() {
  const searchParams = useSearchParams();
  const mode = useProjectStore((state) => state.project.settings.display.workspaceMode);
  const setWorkspaceMode = useProjectStore((state) => state.setWorkspaceMode);
  const requestedMode = normalizeWorkspaceMode(searchParams.get("mode"));

  useEffect(() => {
    if (mode !== requestedMode) {
      setWorkspaceMode(requestedMode);
    }
  }, [mode, requestedMode, setWorkspaceMode]);

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden bg-[#EAF4FA]">
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute left-[18%] top-6 text-[280px] font-black leading-none text-[#0F172A] opacity-[0.04]">
          АРХИТЕКТУРА
        </div>
        <div className="absolute right-[-12%] top-[-20%] h-[62vh] w-[58vw] -skew-x-12 border-l border-white/60 bg-white/5" />
      </div>

      <Map />
      {mode === "architecture" ? (
        <>
          <TopBar />
          <LayersPanel />
          <SelectionToolbar />
          <CartographicLayoutOverlay />
        </>
      ) : null}
      {mode === "3d" ? (
        <ThreeDPanel />
      ) : null}
    </section>
  );
}

function normalizeWorkspaceMode(value: string | null): ProjectWorkspaceMode {
  if (value === "3d") return "3d";
  if (value === "presentation") return "presentation";
  if (value === "analysis") return "analysis";
  return "architecture";
}
