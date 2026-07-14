export type GPULayerKind =
  | "heatmap"
  | "hexagon"
  | "scatter"
  | "grid"
  | "trips"
  | "path"
  | "point-cloud"
  | "instanced";

export interface GPULayerDefinition {
  id: string;
  kind: GPULayerKind;
  sourceId: string;
  visible: boolean;
  props: Record<string, string | number | boolean>;
}

export interface GPURenderPlan {
  layers: GPULayerDefinition[];
  requiresWebGL2: boolean;
  estimatedInstances: number;
}
