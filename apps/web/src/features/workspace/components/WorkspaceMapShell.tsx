"use client";

import { useEffect } from "react";
import Map from "@/components/map";
import CartographicLayoutOverlay from "@/components/map/CartographicLayoutOverlay";
import LayersPanel from "@/features/layers";
import SelectionToolbar from "@/features/selection";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import AnalysisPanel from "./AnalysisPanel";
import PresentationPanel from "./PresentationPanel";
import ThreeDPanel from "./ThreeDPanel";
import WorkspaceContextPanel from "./WorkspaceContextPanel";

export default function WorkspaceMapShell() {
  const project = useProjectStore((state) => state.project);
  const mode = project.settings.display.workspaceMode;
  const setThematicMapType = useUIStore((state) => state.setThematicMapType);

  useEffect(() => {
    if (mode !== "analysis") {
      return;
    }

    if (project.settings.display.activeThematicMapType === "none") {
      setThematicMapType("floors");
    }
  }, [mode, project.settings.display.activeThematicMapType, setThematicMapType]);

  useEffect(() => {
    if (mode === "3d") {
      setThematicMapType("function");
    }
  }, [mode, setThematicMapType]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 p-4">
        <div className={getMapFrameClassName(mode)}>
          <Map />
          {mode === "architecture" ? <LayersPanel /> : null}
          {mode === "architecture" ? <SelectionToolbar /> : null}
          {mode === "analysis" ? <AnalysisPanel /> : null}
          {mode === "presentation" ? <PresentationPanel /> : null}
          {mode === "3d" ? <ThreeDPanel /> : null}
          <CartographicLayoutOverlay />
          {mode === "presentation" ? <PresentationSheetFrame /> : null}
        </div>
      </div>

      <WorkspaceContextPanel />
    </div>
  );
}

function getMapFrameClassName(mode: string): string {
  const base = "relative h-full overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white";

  if (mode === "presentation") {
    return `${base} shadow-[inset_0_0_0_18px_rgba(255,255,255,0.82)]`;
  }

  if (mode === "3d") {
    return `${base} bg-[#0F172A]`;
  }

  return base;
}

function PresentationSheetFrame() {
  return (
    <div className="pointer-events-none absolute inset-8 z-10 rounded-lg border-2 border-white/90 shadow-[0_0_0_1px_rgba(17,24,39,0.18)]" />
  );
}
