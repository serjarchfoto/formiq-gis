import type { IngestionRun } from "../types";

export interface IngestionRunRepository {
  create(run: IngestionRun): Promise<void>;
  update(run: IngestionRun): Promise<void>;
  get(id: string): Promise<IngestionRun | null>;
  getLatest(input: { projectId: string; territoryId: string }): Promise<IngestionRun | null>;
  listByProject(projectId: string): Promise<IngestionRun[]>;
}
