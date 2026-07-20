import type { CanonicalDomain, RawDataRecord } from "../types";

export interface RawDataRepository {
  save(record: RawDataRecord): Promise<void>;
  saveMany(records: RawDataRecord[]): Promise<void>;
  get(id: string): Promise<RawDataRecord | null>;
  listByRun(ingestionRunId: string): Promise<RawDataRecord[]>;
  listByTerritory(input: {
    projectId: string;
    territoryId: string;
    sourceId?: string;
    domain?: CanonicalDomain;
  }): Promise<RawDataRecord[]>;
  deleteByProject(projectId: string): Promise<void>;
}
