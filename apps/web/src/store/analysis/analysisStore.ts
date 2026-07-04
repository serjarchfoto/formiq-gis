"use client";

import { create } from "zustand";
import type { AnalysisResult } from "@/lib";

export type AnalysisStatus = "idle" | "running" | "complete" | "error";

interface AnalysisStore {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  updatedAt: string | null;
  errorMessage: string | null;
  setStatus: (status: AnalysisStatus) => void;
  hydrate: (result: AnalysisResult | null) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  status: "idle",
  result: null,
  updatedAt: null,
  errorMessage: null,
  setStatus: (status) => set({ status }),
  hydrate: (result) => {
    set({
      status: result ? "complete" : "idle",
      result,
      updatedAt: result ? new Date().toISOString() : null,
      errorMessage: null,
    });
  },
  reset: () =>
    set({
      status: "idle",
      result: null,
      updatedAt: null,
      errorMessage: null,
    }),
}));
