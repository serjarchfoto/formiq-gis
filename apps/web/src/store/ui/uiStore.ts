"use client";

import { create } from "zustand";
import { useProjectStore } from "@/store/project";
import type { ThematicMapType } from "@/lib";

interface UIStore {
  isSidebarCollapsed: boolean;
  activeAnalysisLayerId: string;
  activeScenarioId: string;
  compareScenarioId: string;
  completedWorkflowStages: Record<string, boolean>;
  dismissedWorkflowPrompts: Record<string, boolean>;
  activePanelByRoute: Record<string, string>;
  filterByRoute: Record<string, string>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveAnalysisLayerId: (id: string) => void;
  setActiveScenarioId: (id: string) => void;
  setCompareScenarioId: (id: string) => void;
  completeWorkflowStage: (stage: string) => void;
  dismissWorkflowPrompt: (stage: string) => void;
  setRoutePanel: (route: string, panel: string) => void;
  setRouteFilter: (route: string, filter: string) => void;
  setThematicMapType: (type: ThematicMapType) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSidebarCollapsed: false,
  activeAnalysisLayerId: "far",
  activeScenarioId: "base",
  compareScenarioId: "optimistic",
  completedWorkflowStages: {},
  dismissedWorkflowPrompts: {},
  activePanelByRoute: {},
  filterByRoute: {},
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  setActiveAnalysisLayerId: (activeAnalysisLayerId) => set({ activeAnalysisLayerId }),
  setActiveScenarioId: (activeScenarioId) => set({ activeScenarioId }),
  setCompareScenarioId: (compareScenarioId) => set({ compareScenarioId }),
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
}));
