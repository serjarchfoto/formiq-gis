"use client";

import { create } from "zustand";
import { useProjectStore } from "@/store/project";
import type { ThematicMapType } from "@/lib";

interface UIStore {
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setThematicMapType: (type: ThematicMapType) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSidebarCollapsed: false,
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
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
