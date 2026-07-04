import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { AnalysisResult } from "@/lib/gis-engine/analysis";
import type { FormiqProjectData } from "@/types/formiq";

export type ThematicMapType = "none" | string;

export interface ThematicLegendItem {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface ThematicPalette {
  id: string;
  title: string;
  colors: Record<string, string>;
}

export interface ThematicMapMetadata {
  title: string;
  description: string;
  keywords: string[];
  supports3D: boolean;
  supportsPSD: boolean;
}

export interface ThematicMapStyle {
  fillColorProperty: string;
  lineColorProperty: string;
  fillOpacity: number;
  lineOpacity: number;
  lineWidth: number;
}

export interface ThematicMapDefinition {
  id: string;
  type: string;
  title: string;
  description: string;
  geojson: FeatureCollection<Geometry, GeoJsonProperties>;
  legend: ThematicLegendItem[];
  palette: ThematicPalette;
  style: ThematicMapStyle;
  metadata: ThematicMapMetadata;
}

export interface ThematicBuildContext {
  project: FormiqProjectData;
  analysis: AnalysisResult;
}

export interface IThematicLayer {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  supports3D: boolean;
  supportsPSD: boolean;
  build: (context: ThematicBuildContext) => ThematicMapDefinition;
}

export type ThemeGenerator = IThematicLayer;
