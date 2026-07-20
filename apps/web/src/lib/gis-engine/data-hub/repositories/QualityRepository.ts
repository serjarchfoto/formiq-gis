import type { QualityReport } from "../types";

export interface QualityRepository {
  save(report: QualityReport): Promise<void>;
  get(id: string): Promise<QualityReport | null>;
  getLatest(input: { projectId: string; territoryId: string }): Promise<QualityReport | null>;
  listByProject(projectId: string): Promise<QualityReport[]>;
}
