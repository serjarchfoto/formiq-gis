import { DATA_SOURCE_LABELS } from "@/lib";
import type { ImportSourceId } from "@/types/formiq";
import type { BoundingBox, GISLayer } from "@/types/gis";
import { ImportPipeline, type UnifiedImportOptions, type UnifiedImportResult } from "./importPipeline";

export type { ImportProgressEvent, UnifiedImportOptions, UnifiedImportResult } from "./importPipeline";

export function getImportSourceLabel(source: ImportSourceId): string {
  return DATA_SOURCE_LABELS[source];
}

export async function importOSMLayersByBoundingBox(bounds: BoundingBox): Promise<GISLayer[]> {
  const result = await importUnifiedContextByBoundingBox(bounds, { sources: ["osm"] });
  return result.layers;
}

export async function importUnifiedContextByBoundingBox(
  bounds: BoundingBox,
  options: UnifiedImportOptions = {}
): Promise<UnifiedImportResult> {
  return new ImportPipeline().run(bounds, options);
}
