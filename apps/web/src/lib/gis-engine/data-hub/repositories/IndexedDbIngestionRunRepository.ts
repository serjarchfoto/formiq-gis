import {
  addValue,
  DATA_HUB_STORES,
  getFormiqDatabase,
  readAllByIndex,
  readValue,
  writeValue,
} from "@/lib/storage/indexedDbProjectStorage";
import type { IngestionRun } from "../types";
import type { IngestionRunRepository } from "./IngestionRunRepository";
import { cloneForStorage, compareNewest } from "./repositoryUtils";

export class IndexedDbIngestionRunRepository implements IngestionRunRepository {
  async create(run: IngestionRun): Promise<void> {
    await addValue(await getFormiqDatabase(), DATA_HUB_STORES.INGESTION_RUNS, cloneForStorage(run));
  }

  async update(run: IngestionRun): Promise<void> {
    if (!(await this.get(run.id))) throw new Error(`Ingestion run "${run.id}" does not exist.`);
    await writeValue(await getFormiqDatabase(), DATA_HUB_STORES.INGESTION_RUNS, cloneForStorage(run));
  }

  async get(id: string): Promise<IngestionRun | null> {
    return readValue(await getFormiqDatabase(), DATA_HUB_STORES.INGESTION_RUNS, id);
  }

  async getLatest(input: { projectId: string; territoryId: string }): Promise<IngestionRun | null> {
    const runs = await this.listByProject(input.projectId);
    return runs.filter((run) => run.territoryId === input.territoryId).sort(compareNewest)[0] ?? null;
  }

  async listByProject(projectId: string): Promise<IngestionRun[]> {
    const runs = await readAllByIndex<IngestionRun>(
      await getFormiqDatabase(), DATA_HUB_STORES.INGESTION_RUNS, "projectId", projectId
    );
    return runs.sort(compareNewest);
  }
}
