import {
  addValue,
  DATA_HUB_STORES,
  getFormiqDatabase,
  readAllByIndex,
  readValue,
} from "@/lib/storage/indexedDbProjectStorage";
import type { QualityReport } from "../types";
import type { QualityRepository } from "./QualityRepository";
import { cloneForStorage, compareNewest } from "./repositoryUtils";

export class IndexedDbQualityRepository implements QualityRepository {
  async save(report: QualityReport): Promise<void> {
    await addValue(await getFormiqDatabase(), DATA_HUB_STORES.QUALITY_REPORTS, cloneForStorage(report));
  }

  async get(id: string): Promise<QualityReport | null> {
    return readValue(await getFormiqDatabase(), DATA_HUB_STORES.QUALITY_REPORTS, id);
  }

  async getLatest(input: { projectId: string; territoryId: string }): Promise<QualityReport | null> {
    const reports = await this.listByProject(input.projectId);
    return reports.filter((report) => report.territoryId === input.territoryId).sort(compareNewest)[0] ?? null;
  }

  async listByProject(projectId: string): Promise<QualityReport[]> {
    const reports = await readAllByIndex<QualityReport>(
      await getFormiqDatabase(), DATA_HUB_STORES.QUALITY_REPORTS, "projectId", projectId
    );
    return reports.sort(compareNewest);
  }
}
