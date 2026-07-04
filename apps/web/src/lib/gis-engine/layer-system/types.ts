import type { GISLayer } from "@/types/gis";

export type Layer = GISLayer;

export interface LayerSystemState {
  layers: Layer[];
}
