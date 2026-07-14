import { ExportRegistry } from "./ExportRegistry";
import type { ExportJob, ExportOptions, ExportProgress, ExportResult, ExportTask } from "./types";
import type { FormiqProjectData } from "@/types/formiq";

export class ExportEngine {
  private readonly jobs = new Map<string, ExportJob>();

  constructor(readonly registry: ExportRegistry) {}

  async exportProject(
    project: FormiqProjectData,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const task: ExportTask = {
      id: createExportId(),
      context: {
        project,
        options,
        createdAt: new Date().toISOString(),
        onProgress,
      },
    };
    const job: ExportJob = { id: createExportId(), status: "queued", task };
    this.jobs.set(job.id, job);

    try {
      job.status = "running";
      onProgress?.({ stage: "prepare-project", status: "loading", message: "Preparing project", progress: 5 });
      const adapter = this.registry.require(options.format);
      const result = await adapter.export(task.context);
      job.status = "done";
      job.result = result;
      onProgress?.({ stage: "done", status: "ready", message: "Export ready", progress: 100 });
      return result;
    } catch (error) {
      job.status = "error";
      job.errorMessage = error instanceof Error ? error.message : "Export failed";
      onProgress?.({ stage: "done", status: "error", message: job.errorMessage, progress: 100 });
      throw error;
    }
  }

  getJob(id: string): ExportJob | null {
    return this.jobs.get(id) ?? null;
  }
}

function createExportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
