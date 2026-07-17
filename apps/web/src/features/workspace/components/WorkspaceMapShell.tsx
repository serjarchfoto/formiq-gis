"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import CartographicLayoutOverlay from "@/components/map/CartographicLayoutOverlay";
import TopBar from "@/components/topbar";
import LayersPanel from "@/features/layers";
import { useProjectStore } from "@/store/project";
import type { ProjectWorkspaceMode } from "@/types/formiq";
import ThreeDPanel from "./ThreeDPanel";

const Map = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: MapLaunchScreen,
});

export default function WorkspaceMapShell() {
  const searchParams = useSearchParams();
  const mode = useProjectStore((state) => state.project.settings.display.workspaceMode);
  const setWorkspaceMode = useProjectStore((state) => state.setWorkspaceMode);
  const requestedMode = normalizeWorkspaceMode(searchParams.get("mode"));

  useEffect(() => {
    markPerformance("map-route-mounted");
  }, []);

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
          <CartographicLayoutOverlay />
        </>
      ) : null}
      {mode === "3d" ? (
        <ThreeDPanel />
      ) : null}
    </section>
  );
}

function MapLaunchScreen() {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#EAF4FA]">
      <div className="absolute left-[18%] top-6 text-[280px] font-black leading-none text-[#0F172A] opacity-[0.04]">
        КАРТА
      </div>
      <div className="relative flex items-center gap-3 rounded-[20px] border border-white/70 bg-white/62 px-5 py-4 text-[#0F172A] backdrop-blur-3xl">
        <span className="h-4 w-4 animate-pulse rounded-full bg-[#229ED9]" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Открываем карту</p>
          <p className="mt-0.5 text-[12px] text-[#64748B]">Подготавливаем геоданные проекта…</p>
        </div>
      </div>
    </div>
  );
}

function markPerformance(name: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMarks(name);
  performance.mark(name);
}

function normalizeWorkspaceMode(value: string | null): ProjectWorkspaceMode {
  if (value === "3d") return "3d";
  if (value === "presentation") return "presentation";
  if (value === "analysis") return "analysis";
  return "architecture";
}
