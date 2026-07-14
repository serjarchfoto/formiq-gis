export interface TerrainLodState {
  zoom: number;
  screenSpaceError: number;
  demZoom: number;
}

export class TerrainLodController {
  selectLod(zoom: number, screenSpaceError = 4): TerrainLodState {
    const demZoom = Math.max(0, Math.min(15, Math.round(zoom + (screenSpaceError <= 2 ? 1 : 0))));
    return { zoom, screenSpaceError, demZoom };
  }
}

export class CameraImprovementController {
  getPitchForMode(mode: "plan" | "analysis-3d" | "presentation-3d"): number {
    if (mode === "presentation-3d") return 62;
    if (mode === "analysis-3d") return 52;
    return 0;
  }
}

export class ShadowController {
  getShadowOpacity(enabled: boolean, hour: number): number {
    if (!enabled) return 0;
    return hour < 8 || hour > 18 ? 0.38 : 0.22;
  }
}

export class TerrainStreamingController {
  getPrefetchZooms(currentZoom: number): number[] {
    const z = Math.round(currentZoom);
    return [z, z + 1].filter((zoom) => zoom >= 0 && zoom <= 15);
  }
}

export class Navigation3DController {
  getInteractionProfile(enabled: boolean) {
    return {
      pitchWithRotate: enabled,
      dragRotate: enabled,
      terrainAwareMeasurements: enabled,
    };
  }
}
