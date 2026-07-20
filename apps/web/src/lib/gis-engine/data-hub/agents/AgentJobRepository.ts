import { addValue, DATA_HUB_STORES, getFormiqDatabase, readAllByIndex, readValue, writeValue } from "@/lib/storage/indexedDbProjectStorage";
import type { AgentJobRepository as AgentJobRepositoryApi, DataAcquisitionJob } from "./types";

export class IndexedDbAgentJobRepository implements AgentJobRepositoryApi {
  async create(job: DataAcquisitionJob): Promise<void> {
    await addValue(await getFormiqDatabase(), DATA_HUB_STORES.AGENT_JOBS, structuredClone(job));
  }

  async update(job: DataAcquisitionJob): Promise<void> {
    await writeValue(await getFormiqDatabase(), DATA_HUB_STORES.AGENT_JOBS, structuredClone(job));
  }

  async get(id: string): Promise<DataAcquisitionJob | null> {
    return readValue(await getFormiqDatabase(), DATA_HUB_STORES.AGENT_JOBS, id);
  }

  async listByProject(projectId: string): Promise<DataAcquisitionJob[]> {
    return readAllByIndex<DataAcquisitionJob>(await getFormiqDatabase(), DATA_HUB_STORES.AGENT_JOBS, "projectId", projectId);
  }
}

export class InMemoryAgentJobRepository implements AgentJobRepositoryApi {
  private readonly jobs = new Map<string, DataAcquisitionJob>();

  async create(job: DataAcquisitionJob): Promise<void> { this.jobs.set(job.id, structuredClone(job)); }
  async update(job: DataAcquisitionJob): Promise<void> { this.jobs.set(job.id, structuredClone(job)); }
  async get(id: string): Promise<DataAcquisitionJob | null> { return structuredClone(this.jobs.get(id) ?? null); }
  async listByProject(projectId: string): Promise<DataAcquisitionJob[]> {
    return [...this.jobs.values()].filter((job) => job.projectId === projectId).map((job) => structuredClone(job));
  }
}
