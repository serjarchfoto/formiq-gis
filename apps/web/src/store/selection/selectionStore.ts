"use client";

import { create } from "zustand";
import type { Feature, Polygon, Position } from "geojson";
import type { FormiqTerritory } from "@/types/formiq";
import { useProjectStore } from "@/store/project";
import type { BoundingBox } from "@/types/gis";
import {
  closeRing,
  convertSelectionShape,
  createSelectionFromTerritory,
  createTerritorySelection,
} from "@/features/selection/selectionGeometry";
import { AreaService } from "@/features/selection/areaService";

export type SelectionMode = "none" | "rectangle" | "polygon";
export type TerritorySelectionShape = "rectangle" | "polygon";

export interface TerritorySelection {
  shape: TerritorySelectionShape;
  bounds: BoundingBox;
  geometry: Feature<Polygon>;
}

interface SelectionStore {
  mode: SelectionMode;
  selection: TerritorySelection | null;
  draftCoordinates: Position[];
  history: TerritorySelection[];
  future: TerritorySelection[];
  setMode: (mode: SelectionMode) => void;
  setDraftCoordinates: (coordinates: Position[]) => void;
  setSelectionPreview: (selection: TerritorySelection | null) => void;
  syncSelectionFromProject: (territory: FormiqTerritory | null) => void;
  commitRectangle: (coordinates: Position[]) => void;
  commitPolygon: () => void;
  commitSelectionUpdate: () => void;
  updateSelectionGeometry: (coordinates: Position[], options?: { persist?: boolean; shape?: TerritorySelectionShape }) => void;
  switchSelectionShape: (shape: TerritorySelectionShape) => void;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  mode: "none",
  selection: null,
  draftCoordinates: [],
  history: [],
  future: [],

  setMode: (mode) => {
    const project = useProjectStore.getState().project;
    const activeTerritory = project.territories.find((territory) => territory.id === project.activeTerritoryId);
    if (activeTerritory?.locked || activeTerritory?.status === "importing") return;
    set({ mode, draftCoordinates: [] });
  },

  setDraftCoordinates: (draftCoordinates) => set({ draftCoordinates }),

  setSelectionPreview: (selection) => {
    set({
      selection,
      draftCoordinates: [],
      mode: "none",
    });
    if (selection) AreaService.update(selection);
  },

  syncSelectionFromProject: (territory) =>
    set((state) => {
      const nextSelection = territory ? createSelectionFromTerritory(territory) : null;

      if (areSelectionsEqual(state.selection, nextSelection)) {
        return state;
      }

      AreaService.setArea(nextSelection);
      return {
        selection: nextSelection,
        draftCoordinates: [],
        mode: state.mode === "none" ? "none" : state.mode,
      };
    }),

  commitRectangle: (coordinates) => {
    const selection = createTerritorySelection(closeRing(coordinates), "rectangle");

    set({
      mode: "none",
      draftCoordinates: [],
      selection,
      history: get().selection ? [...get().history, get().selection as TerritorySelection] : get().history,
      future: [],
    });
    AreaService.setArea(selection);
    useProjectStore.getState().createTerritoryFromSelection(selection);
  },

  commitPolygon: () => {
    const { draftCoordinates } = get();

    if (draftCoordinates.length < 3) {
      return;
    }

    const selection = createTerritorySelection(closeRing(draftCoordinates), "polygon");

    set({
      mode: "none",
      draftCoordinates: [],
      selection,
      history: get().selection ? [...get().history, get().selection as TerritorySelection] : get().history,
      future: [],
    });
    AreaService.setArea(selection);
    useProjectStore.getState().createTerritoryFromSelection(selection);
  },

  commitSelectionUpdate: () => {
    const selection = get().selection;

    if (!selection) {
      return;
    }

    useProjectStore.getState().updateTerritoryFromSelection(selection);
    AreaService.update(selection);
  },

  updateSelectionGeometry: (coordinates, options) => {
    const currentShape = options?.shape ?? get().selection?.shape ?? "polygon";
    const nextSelection = createTerritorySelection(closeRing(coordinates), currentShape);

    set({
      selection: nextSelection,
      draftCoordinates: [],
      mode: "none",
      history: get().selection ? [...get().history, get().selection as TerritorySelection] : get().history,
      future: [],
    });
    AreaService.update(nextSelection);

    if (options?.persist) {
      useProjectStore.getState().updateTerritoryFromSelection(nextSelection);
    }
  },

  switchSelectionShape: (shape) => {
    const selection = get().selection;

    if (!selection) {
      set({ mode: shape, draftCoordinates: [] });
      return;
    }

    const nextSelection = convertSelectionShape(selection, shape);

    set({
      selection: nextSelection,
      draftCoordinates: [],
      mode: "none",
      history: [...get().history, selection],
      future: [],
    });
    AreaService.update(nextSelection);

    useProjectStore.getState().updateTerritoryFromSelection(nextSelection);
  },

  clearSelection: () => {
    const project = useProjectStore.getState().project;
    const activeTerritory = project.territories.find((territory) => territory.id === project.activeTerritoryId);
    if (activeTerritory?.locked || activeTerritory?.status === "importing") return;
    set({
      mode: "none",
      selection: null,
      draftCoordinates: [],
    });
    AreaService.clear();
    void useProjectStore.getState().clearActiveTerritory();
  },
  undo: () => {
    const state = get();
    const previous = state.history.at(-1);
    if (!previous) return;
    set({ selection: previous, history: state.history.slice(0, -1), future: state.selection ? [state.selection, ...state.future] : state.future, mode: "none", draftCoordinates: [] });
    AreaService.setArea(previous);
    useProjectStore.getState().updateTerritoryFromSelection(previous);
  },
  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return;
    set({ selection: next, future: state.future.slice(1), history: state.selection ? [...state.history, state.selection] : state.history, mode: "none", draftCoordinates: [] });
    AreaService.setArea(next);
    useProjectStore.getState().updateTerritoryFromSelection(next);
  },
}));

function areSelectionsEqual(left: TerritorySelection | null, right: TerritorySelection | null): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (left.shape !== right.shape) {
    return false;
  }

  const leftCoordinates = left.geometry.geometry.coordinates[0] ?? [];
  const rightCoordinates = right.geometry.geometry.coordinates[0] ?? [];

  if (leftCoordinates.length !== rightCoordinates.length) {
    return false;
  }

  return leftCoordinates.every((coordinate, index) => {
    const other = rightCoordinates[index];
    return Boolean(other) && coordinate[0] === other[0] && coordinate[1] === other[1];
  });
}
