"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useProjectStore } from "@/store/project";
import type { ThematicMapType } from "@/lib";

interface UIStore {
  isSidebarCollapsed: boolean;
  activeAnalysisLayerId: string;
  activeScenarioId: string;
  compareScenarioId: string;
  comparisonMode: "off" | "difference" | "split";
  analysisViewMode: "2d" | "3d";
  analysisLayerOpacity: number;
  analysisLayerFilters: Record<string, Record<string, string | number | boolean | string[]>>;
  analysisPanels: Record<"navigation" | "metrics" | "scenarios" | "bottomMetrics" | "mobile", boolean>;
  completedWorkflowStages: Record<string, boolean>;
  dismissedWorkflowPrompts: Record<string, boolean>;
  activePanelByRoute: Record<string, string>;
  filterByRoute: Record<string, string>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveAnalysisLayerId: (id: string) => void;
  setActiveScenarioId: (id: string) => void;
  setCompareScenarioId: (id: string) => void;
  setComparisonMode: (mode: UIStore["comparisonMode"]) => void;
  setAnalysisViewMode: (mode: UIStore["analysisViewMode"]) => void;
  setAnalysisLayerOpacity: (opacity: number) => void;
  setAnalysisLayerFilter: (layerId: string, filterId: string, value: string | number | boolean | string[]) => void;
  setAnalysisPanelCollapsed: (panel: keyof UIStore["analysisPanels"], collapsed: boolean) => void;
  completeWorkflowStage: (stage: string) => void;
  dismissWorkflowPrompt: (stage: string) => void;
  setRoutePanel: (route: string, panel: string) => void;
  setRouteFilter: (route: string, filter: string) => void;
  setThematicMapType: (type: ThematicMapType) => void;
}

export const useUIStore = create<UIStore>()(persist((set) => ({
  isSidebarCollapsed: false,
  activeAnalysisLayerId: "built-density",
  activeScenarioId: "base",
  compareScenarioId: "optimistic",
  comparisonMode: "off",
  analysisViewMode: "2d",
  analysisLayerOpacity: 1,
  analysisLayerFilters: {},
  analysisPanels: { navigation: false, metrics: false, scenarios: false, bottomMetrics: false, mobile: false },
  completedWorkflowStages: {},
  dismissedWorkflowPrompts: {},
  activePanelByRoute: {},
  filterByRoute: {},
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  setActiveAnalysisLayerId: (activeAnalysisLayerId) => set({ activeAnalysisLayerId }),
  setActiveScenarioId: (activeScenarioId) => set({ activeScenarioId }),
  setCompareScenarioId: (compareScenarioId) => set({ compareScenarioId }),
  setComparisonMode: (comparisonMode) => set({ comparisonMode }),
  setAnalysisViewMode: (analysisViewMode) => set({ analysisViewMode }),
  setAnalysisLayerOpacity: (analysisLayerOpacity) =>
    set({ analysisLayerOpacity: Math.min(1, Math.max(0, analysisLayerOpacity)) }),
  setAnalysisLayerFilter: (layerId, filterId, value) =>
    set((state) => ({
      analysisLayerFilters: {
        ...state.analysisLayerFilters,
        [layerId]: {
          ...state.analysisLayerFilters[layerId],
          [filterId]: value,
        },
      },
    })),
  setAnalysisPanelCollapsed: (panel, collapsed) =>
    set((state) => ({
      analysisPanels: { ...state.analysisPanels, [panel]: collapsed },
    })),
  completeWorkflowStage: (stage) =>
    set((state) => ({
      completedWorkflowStages: {
        ...state.completedWorkflowStages,
        [stage]: true,
      },
    })),
  dismissWorkflowPrompt: (stage) =>
    set((state) => ({
      dismissedWorkflowPrompts: {
        ...state.dismissedWorkflowPrompts,
        [stage]: true,
      },
    })),
  setRoutePanel: (route, panel) =>
    set((state) => ({
      activePanelByRoute: {
        ...state.activePanelByRoute,
        [route]: panel,
      },
    })),
  setRouteFilter: (route, filter) =>
    set((state) => ({
      filterByRoute: {
        ...state.filterByRoute,
        [route]: filter,
      },
    })),
  setThematicMapType: (thematicMapType) => {
    useProjectStore.getState().updateProject((project) => ({
      ...project,
      settings: {
        ...project.settings,
        display: {
          ...project.settings.display,
          activeThematicMapType: thematicMapType,
        },
      },
    }));
  },
}), {
  name: "formiq-analysis-ui-session",
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    activeAnalysisLayerId: state.activeAnalysisLayerId,
    activeScenarioId: state.activeScenarioId,
    compareScenarioId: state.compareScenarioId,
    comparisonMode: state.comparisonMode,
    analysisViewMode: state.analysisViewMode,
    analysisLayerOpacity: state.analysisLayerOpacity,
    analysisLayerFilters: state.analysisLayerFilters,
    analysisPanels: state.analysisPanels,
    activePanelByRoute: state.activePanelByRoute,
  }),
}));
