"use client";

import { create } from "zustand";
import type {
  ImportGridCell,
  ImportGridCellStatus,
  LayerChunkManifest,
  TerritoryImportPhase,
  TerritoryImportProgress,
} from "@/lib/gis-engine/chunks";

interface ImportStoreState {
  sessionId: string | null;
  projectId: string | null;
  phase: TerritoryImportPhase;
  progress: TerritoryImportProgress;
  cells: Record<string, ImportGridCell>;
  manifests: LayerChunkManifest[];
  loadedChunkIds: string[];
  errors: string[];
  start: (sessionId: string, projectId: string, cells: ImportGridCell[], totalSourceRequests: number) => void;
  setPhase: (phase: TerritoryImportPhase) => void;
  setProgress: (progress: Partial<TerritoryImportProgress>) => void;
  updateCell: (cell: ImportGridCell, status: ImportGridCellStatus, error?: string) => void;
  addManifest: (manifest: LayerChunkManifest) => void;
  hydrateManifests: (projectId: string, manifests: LayerChunkManifest[]) => void;
  markChunkRendered: (chunkId: string) => void;
  fail: (message: string) => void;
  cancel: () => void;
}

const emptyProgress: TerritoryImportProgress = {
  phase: "idle",
  completedCells: 0,
  totalCells: 0,
  downloadedSources: 0,
  totalSourceRequests: 0,
  persistedChunks: 0,
  renderedChunks: 0,
  totalChunks: 0,
  percent: 0,
};

let lastTransientPhaseUpdateAt = 0;

export const useImportStore = create<ImportStoreState>((set) => ({
  sessionId: null,
  projectId: null,
  phase: "idle",
  progress: emptyProgress,
  cells: {},
  manifests: [],
  loadedChunkIds: [],
  errors: [],
  start: (sessionId, projectId, cells, totalSourceRequests) => set({
    sessionId,
    projectId,
    phase: "downloading",
    progress: { ...emptyProgress, phase: "downloading", totalCells: cells.length, totalSourceRequests },
    cells: Object.fromEntries(cells.map((cell) => [cell.id, cell])),
    manifests: [],
    loadedChunkIds: [],
    errors: [],
  }),
  setPhase: (phase) => set((state) => {
    const now = Date.now();
    const isTransientPhase = phase === "downloading" || phase === "processing" || phase === "persisting";
    if (
      isTransientPhase &&
      phase !== state.phase &&
      now - lastTransientPhaseUpdateAt < 120
    ) {
      return state;
    }
    if (isTransientPhase) lastTransientPhaseUpdateAt = now;
    const effectivePhase =
      phase === "rendering" &&
      state.manifests.length > 0 &&
      state.loadedChunkIds.length >= state.manifests.length
        ? "completed"
        : phase;
    return {
      phase: effectivePhase,
      progress: calculateProgress({ ...state.progress, phase: effectivePhase }),
    };
  }),
  setProgress: (progress) => set((state) => ({ progress: calculateProgress({ ...state.progress, ...progress }) })),
  updateCell: (cell, status, error) => set((state) => ({
    cells: { ...state.cells, [cell.id]: { ...cell, status, error: error ?? null } },
    errors: error ? [...state.errors, error] : state.errors,
  })),
  addManifest: (manifest) => set((state) => state.manifests.some((item) => item.id === manifest.id)
    ? state
    : { manifests: [...state.manifests, manifest] }),
  hydrateManifests: (projectId, manifests) => set((state) => ({
    projectId,
    manifests,
    loadedChunkIds: state.projectId === projectId ? state.loadedChunkIds : [],
  })),
  markChunkRendered: (chunkId) => set((state) => {
    if (state.loadedChunkIds.includes(chunkId)) return state;
    const loadedChunkIds = [...state.loadedChunkIds, chunkId];
    const completed = state.phase === "rendering" && loadedChunkIds.length >= state.manifests.length;
    return {
      loadedChunkIds,
      phase: completed ? "completed" : state.phase,
      progress: calculateProgress({
        ...state.progress,
        phase: completed ? "completed" : state.progress.phase,
        renderedChunks: loadedChunkIds.length,
        totalChunks: state.manifests.length,
      }),
    };
  }),
  fail: (message) => set((state) => ({ phase: "error", errors: [...state.errors, message], progress: { ...state.progress, phase: "error" } })),
  cancel: () => set((state) => ({ phase: "cancelled", progress: { ...state.progress, phase: "cancelled" } })),
}));

function calculateProgress(progress: TerritoryImportProgress): TerritoryImportProgress {
  const downloadRatio = progress.totalSourceRequests ? progress.downloadedSources / progress.totalSourceRequests : 0;
  const persistRatio = progress.totalChunks ? progress.persistedChunks / progress.totalChunks : 0;
  const renderRatio = progress.totalChunks ? progress.renderedChunks / progress.totalChunks : 0;
  const percent = progress.phase === "completed"
    ? 100
    : Math.min(99, Math.round(downloadRatio * 55 + persistRatio * 25 + renderRatio * 20));
  return { ...progress, percent };
}
