import type { ThreeDSceneBuildContext, ThreeDSceneDescriptor, WhiteModelMeshDescriptor } from "./types";

export class Visualization3DEngine {
  buildWhiteModelScene({ project, style }: ThreeDSceneBuildContext): ThreeDSceneDescriptor {
    return {
      id: `${project.id}-white-model`,
      projection: style.projection,
      cameraPreset: style.cameraPreset,
      style,
      meshes: project.buildings.map((building): WhiteModelMeshDescriptor => ({
        id: `${building.id}-mesh`,
        sourceObjectId: building.id,
        kind: "building",
        extrusionHeight: building.threeD.whiteModel.extrusionHeight,
        baseElevation: building.threeD.whiteModel.baseElevation,
        materialId: style.materials.building.id,
      })),
    };
  }
}
