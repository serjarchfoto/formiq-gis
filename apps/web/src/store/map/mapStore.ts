"use client";

import { create } from "zustand";
import type { Position } from "geojson";
import type { OfflineTileSource } from "@/lib/gis-engine/pmtiles";

export interface MapViewport {
  center: [number, number];
  zoom: number;
}

export type MeasurementMode = "none" | "distance" | "area";

export interface CursorCoordinates {
  longitude: number;
  latitude: number;
}

export interface SelectedMapObject {
  id: string;
  type: string;
  category: string;
  properties: Record<string, string | number | boolean | null>;
}

interface MapStore {
  viewport: MapViewport;
  cursorCoordinates: CursorCoordinates | null;
  scaleLabel: string;
  measurementMode: MeasurementMode;
  measurementPoints: Position[];
  selectedObject: SelectedMapObject | null;
  pmTilesSources: OfflineTileSource[];
  setViewport: (viewport: MapViewport) => void;
  setCursorCoordinates: (coordinates: CursorCoordinates | null) => void;
  setScaleLabel: (scaleLabel: string) => void;
  setMeasurementMode: (mode: MeasurementMode) => void;
  addMeasurementPoint: (point: Position) => void;
  clearMeasurement: () => void;
  setSelectedObject: (object: SelectedMapObject | null) => void;
  addPMTilesSource: (source: OfflineTileSource) => void;
  removePMTilesSource: (id: string) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  viewport: {
    center: [37.6176, 55.7558],
    zoom: 11,
  },
  cursorCoordinates: null,
  scaleLabel: "100 м",
  measurementMode: "none",
  measurementPoints: [],
  selectedObject: null,
  pmTilesSources: [],
  setViewport: (viewport) => set({ viewport }),
  setCursorCoordinates: (cursorCoordinates) => set({ cursorCoordinates }),
  setScaleLabel: (scaleLabel) => set({ scaleLabel }),
  setMeasurementMode: (measurementMode) =>
    set({
      measurementMode,
      measurementPoints: [],
      selectedObject: null,
    }),
  addMeasurementPoint: (point) =>
    set((state) => ({
      measurementPoints: [...state.measurementPoints, point],
    })),
  clearMeasurement: () =>
    set({
      measurementMode: "none",
      measurementPoints: [],
    }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  addPMTilesSource: (source) =>
    set((state) => ({
      pmTilesSources: [
        ...state.pmTilesSources.filter((candidate) => candidate.id !== source.id),
        source,
      ],
    })),
  removePMTilesSource: (id) =>
    set((state) => ({
      pmTilesSources: state.pmTilesSources.filter((source) => source.id !== id),
    })),
}));
