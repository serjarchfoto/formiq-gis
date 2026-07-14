import type { DataSourceKind } from "@/types/formiq";
import { DataSourceEngine } from "./DataSourceEngine";
import type { DataSourceHealth } from "./types";

export class SourceHealthMonitor {
  private readonly states = new Map<DataSourceKind, DataSourceHealth>();

  constructor(private readonly engine: DataSourceEngine) {}

  async checkAll(): Promise<DataSourceHealth[]> {
    const results = await this.engine.healthCheck();
    results.forEach((result) => this.states.set(result.source, result));
    return results;
  }

  async check(source: DataSourceKind): Promise<DataSourceHealth> {
    const [result] = await this.engine.healthCheck(source);

    if (!result) {
      throw new Error(`Health check for "${source}" did not return a result.`);
    }

    this.states.set(source, result);
    return result;
  }

  getState(source: DataSourceKind): DataSourceHealth | undefined {
    return this.states.get(source);
  }

  getStates(): DataSourceHealth[] {
    return Array.from(this.states.values());
  }
}
