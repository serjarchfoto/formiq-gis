"use client";

import { create } from "zustand";
import type { Feature, Polygon, Position } from "geojson";
import { useProjectStore } from "@/store/project";
import type { BoundingBox } from "@/types/gis";

export type SelectionMode = "none" | "rectangle" | "polygon";

export interface TerritorySelection {
  bounds: BoundingBox;
  geometry: Feature<Polygon>;
}

interface SelectionStore {
  mode: SelectionMode;
  selection: TerritorySelection | null;
  draftCoordinates: Position[];
  setMode: (mode: SelectionMode) => void;
  setDraftCoordinates: (coordinates: Position[]) => void;
  commitRectangle: (coordinates: Position[]) => void;
  commitPolygon: () => void;
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

  commitRectangle: (coordinates) => {
    const closedCoordinates = closeRing(coordinates);
    const selection = createTerritorySelection(closedCoordinates);

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

    const selection = createTerritorySelection(closeRing(draftCoordinates));

    set({
      mode: "none",
      draftCoordinates: [],
      selection,
    });
    useProjectStore.getState().createTerritoryFromSelection(selection);
  },

  clearSelection: () =>
    set({
      mode: "none",
      selection: null,
      draftCoordinates: [],
    }),
}));

function createTerritorySelection(coordinates: Position[]): TerritorySelection {
  return {
    bounds: createBoundingBox(coordinates),
    geometry: {
      type: "Feature",
      properties: {
        source: "formiq-selection",
      },
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    },
  };
}

function createBoundingBox(coordinates: Position[]): BoundingBox {
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function closeRing(coordinates: Position[]): Position[] {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) {
    return coordinates;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}
