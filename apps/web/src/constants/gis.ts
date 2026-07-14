import type { GISImportFormat, RasterSourceType } from "@/types/gis";

export const SUPPORTED_VECTOR_FORMATS: GISImportFormat[] = [
  "geojson",
  "shapefile",
  "geopackage",
  "kml",
  "gpx",
  "csv",
  "dxf",
];

export const SUPPORTED_RASTER_SOURCES: RasterSourceType[] = [
  "dem",
  "satellite",
];

export const DEFAULT_OSM_LAYER_STYLES = {
  buildings: {
    fillColor: "#9CA3AF",
    lineColor: "#6B7280",
    opacity: 0.42,
  },
  roads: {
    lineColor: "#F59E0B",
    lineWidth: 2,
    opacity: 0.9,
  },
  green: {
    fillColor: "#22C55E",
    lineColor: "#16A34A",
    opacity: 0.38,
  },
  water: {
    fillColor: "#38BDF8",
    lineColor: "#0284C7",
    opacity: 0.45,
  },
  terrain: {
    fillColor: "#A3A3A3",
    lineColor: "#525252",
    opacity: 0.72,
  },
  boundaries: {
    fillColor: "#64748B",
    lineColor: "#475569",
    opacity: 0.08,
  },
  poi: {
    fillColor: "#F97316",
    lineColor: "#EA580C",
    opacity: 0.95,
  },
  transit: {
    fillColor: "#8B5CF6",
    lineColor: "#7C3AED",
    opacity: 0.95,
  },
} as const;
