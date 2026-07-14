import { filterEntitiesByBbox, filterEntitiesByIds, getProjectEntities, sanitizeFilename } from "./exportUtils";
import type { ExportAdapter, ExportContext, ExportFormat, ExportProgress, ExportResult } from "./types";
import type { FormiqEntity } from "@/types/formiq";

export abstract class BaseExporter implements ExportAdapter {
  abstract readonly format: ExportFormat;
  abstract readonly label: string;
  abstract readonly extension: string;
  abstract readonly mimeType: string;

  abstract export(context: ExportContext): Promise<ExportResult>;

  protected getEntities(context: ExportContext): FormiqEntity[] {
    const scope = context.options.scope ?? "project";
    let entities = getProjectEntities(context.project);

    if (scope === "visible-area") {
      entities = filterEntitiesByBbox(entities, context.options.bbox);
    }

    if (scope === "selection") {
      entities = filterEntitiesByIds(entities, context.options.selectedIds);
    }

    return entities;
  }

  protected createResult(context: ExportContext, data: Uint8Array, featureCount: number): ExportResult {
    return {
      format: this.format,
      filename: this.resolveFilename(context),
      mimeType: this.mimeType,
      data,
      size: data.byteLength,
      metadata: {
        featureCount,
        createdAt: context.createdAt,
        crs: context.options.crs ?? context.project.crs,
        scope: context.options.scope ?? "project",
      },
    };
  }

  protected emit(context: ExportContext, progress: ExportProgress): void {
    context.onProgress?.(progress);
  }

  protected resolveFilename(context: ExportContext): string {
    const base = sanitizeFilename(context.options.filename ?? `${context.project.name}-${this.format}`);
    return base.endsWith(`.${this.extension}`) ? base : `${base}.${this.extension}`;
  }
}

export class UnsupportedExporter extends BaseExporter {
  readonly label: string;
  readonly extension: string;
  readonly mimeType = "application/octet-stream";

  constructor(readonly format: ExportFormat, label: string = format) {
    super();
    this.label = label;
    this.extension = format;
  }

  async export(): Promise<ExportResult> {
    throw new Error(`${this.label} export is registered but not implemented yet.`);
  }
}
