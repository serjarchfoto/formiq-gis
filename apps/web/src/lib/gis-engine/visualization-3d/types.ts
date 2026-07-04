import type { FormiqBuilding, FormiqProjectData } from "@/types/formiq";
import type { ThreeDVisualizationStyle } from "@/lib/gis-engine/cartographic-style";

export interface WhiteModelMeshDescriptor {
  id: string;
  sourceObjectId: string;
  kind: "building" | "terrain" | "road" | "water" | "vegetation";
  extrusionHeight: number | null;
  baseElevation: number | null;
  materialId: string;
}

export interface ThreeDSceneDescriptor {
  id: string;
  projection: "orthographic" | "perspective";
  cameraPreset: "axonometric" | "top" | "free";
  style: ThreeDVisualizationStyle;
  meshes: WhiteModelMeshDescriptor[];
}

export interface ThreeDSceneBuildContext {
  project: FormiqProjectData;
  style: ThreeDVisualizationStyle;
}

export type ThreeDBuildingSource = Pick<FormiqBuilding, "id" | "threeD">;
