"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnalysisResult } from "@/lib";

export type AnalysisStatus = "idle" | "running" | "complete" | "error";

interface AnalysisStore {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  updatedAt: string | null;
  errorMessage: string | null;
  projectId: string | null;
  setStatus: (status: AnalysisStatus) => void;
  hydrate: (result: AnalysisResult | null, projectId?: string) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisStore>()(persist((set) => ({
  status: "idle",
  result: null,
  updatedAt: null,
  errorMessage: null,
  projectId: null,
  setStatus: (status) => set({ status }),
  hydrate: (result, projectId) => {
    set({
      status: result ? "complete" : "idle",
      result,
      projectId: projectId ?? null,
      updatedAt: result ? new Date().toISOString() : null,
      errorMessage: null,
    });
  },
  reset: () =>
    set({
      status: "idle",
      result: null,
      projectId: null,
      updatedAt: null,
      errorMessage: null,
  }),
}), {
  name: "formiq-analysis-snapshot",
  partialize: (state) => ({
    status: state.status,
    result: state.result,
    updatedAt: state.updatedAt,
    projectId: state.projectId,
    errorMessage: state.errorMessage,
  }),
}));
