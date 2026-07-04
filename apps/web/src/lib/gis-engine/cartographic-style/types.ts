import type { CartographicThemeId, RoadType, RoadWidthMode, UnifiedFeatureKind } from "@/types/formiq";

export interface CartographicColorSet {
  canvas: string;
  paper: string;
  text: string;
  mutedText: string;
  buildingFill: string;
  buildingStroke: string;
  buildingHover: string;
  buildingSelected: string;
  roadCasing: string;
  roadMotorway: string;
  roadPrimary: string;
  roadSecondary: string;
  roadLocal: string;
  roadPedestrian: string;
  vegetationFill: string;
  vegetationStroke: string;
  waterFill: string;
  waterStroke: string;
  terrainFill: string;
  boundaryStroke: string;
  utility: string;
  selection: string;
  whiteModelBuilding: string;
  whiteModelTerrain: string;
  shadow: string;
}

export interface CartographicTheme {
  id: CartographicThemeId;
  title: string;
  description: string;
  colors: CartographicColorSet;
  font: string;
  paperTexture: "none" | "subtle-grid" | "blueprint-grid";
}

export interface RoadClassStyle {
  roadType: RoadType;
  colorToken: keyof CartographicColorSet;
  casingWidth: number;
  lineWidth: number;
  order: number;
}

export interface CompiledMapStyle {
  background: string;
  buildingFill: Record<string, unknown>;
  buildingStroke: Record<string, unknown>;
  roadCasing: Record<string, unknown>;
  roadLine: Record<string, unknown>;
  vegetationFill: Record<string, unknown>;
  waterFill: Record<string, unknown>;
}

export interface SymbolDefinition {
  id: string;
  title: string;
  category: string;
  path: string;
  featureKinds: UnifiedFeatureKind[];
}

export interface ThreeDMaterialStyle {
  id: string;
  color: string;
  roughness: number;
  opacity: number;
  outlineColor: string;
  shadowColor: string;
}

export interface ThreeDVisualizationStyle {
  themeId: CartographicThemeId;
  projection: "orthographic" | "perspective";
  cameraPreset: "axonometric" | "top" | "free";
  materials: {
    building: ThreeDMaterialStyle;
    terrain: ThreeDMaterialStyle;
    road: ThreeDMaterialStyle;
    water: ThreeDMaterialStyle;
    vegetation: ThreeDMaterialStyle;
  };
}

export interface MapStyleSettings {
  themeId: CartographicThemeId;
  roadWidthMode: RoadWidthMode;
  customRoadWidthMultiplier: number;
  showRoadCasings: boolean;
}
