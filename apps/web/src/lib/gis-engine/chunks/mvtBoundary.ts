import type { LayerChunkType } from "./types";

export interface ProjectVectorTileRequest {
  projectId: string;
  layer: LayerChunkType;
  z: number;
  x: number;
  y: number;
}

/**
 * Reserved contract only. Chunked import currently renders persisted GeoJSON
 * directly and must not advertise an endpoint that is not implemented.
 */
export const PROJECT_VECTOR_TILE_ROUTE = "/api/projects/:projectId/tiles/:layer/:z/:x/:y.pbf";

export function getProjectVectorTileUrlTemplate(projectId: string, layer: LayerChunkType | "{layer}" = "{layer}"): string {
  return `/api/projects/${encodeURIComponent(projectId)}/tiles/${layer}/{z}/{x}/{y}.pbf`;
}

export interface ProjectVectorTileProvider {
  getTile(request: ProjectVectorTileRequest, signal?: AbortSignal): Promise<ArrayBuffer>;
}
