"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AnalysisResult } from "@/lib";

export type AnalysisStatus = "idle" | "running" | "complete" | "error";

interface AnalysisStore {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  updatedAt: string | null;
  errorMessage: string | null;
  projectId: string | null;
  cacheKey: string | null;
  setStatus: (status: AnalysisStatus) => void;
  hydrate: (result: AnalysisResult | null, projectId: string, cacheKey?: string) => void;
  reset: () => void;
}

const analysisStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Older versions persisted full geometries and could fill the quota.
      // Keep analysis usable even when browser storage is unavailable.
      try {
        window.localStorage.removeItem(name);
        window.localStorage.setItem(name, value);
      } catch {
        // Storage is optional; the analysis is recomputed from project data.
      }
    }
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore unavailable storage.
    }
  },
}));

export const useAnalysisStore = create<AnalysisStore>()(persist((set) => ({
  status: "idle",
  result: null,
  updatedAt: null,
  errorMessage: null,
  projectId: null,
  cacheKey: null,
  setStatus: (status) => set({ status }),
  hydrate: (result, projectId, cacheKey) => {
    set({
      status: result ? "complete" : "idle",
      result,
      projectId,
      cacheKey: cacheKey ?? null,
      updatedAt: result ? new Date().toISOString() : null,
      errorMessage: null,
    });
  },
  reset: () =>
    set({
      status: "idle",
      result: null,
      projectId: null,
      cacheKey: null,
      updatedAt: null,
      errorMessage: null,
  }),
}), {
  name: "formiq-analysis-snapshot",
  storage: analysisStorage,
  partialize: (state) => ({
    status: state.status,
    updatedAt: state.updatedAt,
    projectId: state.projectId,
    cacheKey: state.cacheKey,
    errorMessage: state.errorMessage,
  }),
}));
