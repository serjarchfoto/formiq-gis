import type { CanonicalQuery, CanonicalQueryResult, CanonicalSnapshot } from "../types";

export interface CanonicalRepository {
  saveSnapshot(snapshot: CanonicalSnapshot): Promise<void>;
  getSnapshot(id: string): Promise<CanonicalSnapshot | null>;
  getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null>;
  query(query: CanonicalQuery): Promise<CanonicalQueryResult>;
  deleteByProject(projectId: string): Promise<void>;
}
