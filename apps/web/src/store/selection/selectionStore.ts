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
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  mode: "none",
  selection: null,
  draftCoordinates: [],

  setMode: (mode) =>
    set({
      mode,
      draftCoordinates: [],
    }),

  setDraftCoordinates: (draftCoordinates) => set({ draftCoordinates }),

  setSelectionPreview: (selection) =>
    set({
      selection,
      draftCoordinates: [],
      mode: "none",
    }),

  syncSelectionFromProject: (territory) =>
    set((state) => {
      const nextSelection = territory ? createSelectionFromTerritory(territory) : null;

      if (areSelectionsEqual(state.selection, nextSelection)) {
        return state;
      }

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
    });
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
    });
    useProjectStore.getState().createTerritoryFromSelection(selection);
  },

  commitSelectionUpdate: () => {
    const selection = get().selection;

    if (!selection) {
      return;
    }

    useProjectStore.getState().updateTerritoryFromSelection(selection);
  },

  updateSelectionGeometry: (coordinates, options) => {
    const currentShape = options?.shape ?? get().selection?.shape ?? "polygon";
    const nextSelection = createTerritorySelection(closeRing(coordinates), currentShape);

    set({
      selection: nextSelection,
      draftCoordinates: [],
      mode: "none",
    });

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
    });

    useProjectStore.getState().updateTerritoryFromSelection(nextSelection);
  },

  clearSelection: () =>
    set({
      mode: "none",
      selection: null,
      draftCoordinates: [],
    }),
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
