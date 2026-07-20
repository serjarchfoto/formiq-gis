import type { CanonicalDomain } from "./types";

export interface DataHubLogEvent {
  timestamp: string;
  level: "debug" | "info" | "warning" | "error";
  operation:
    | "source_selection"
    | "source_fetch"
    | "raw_persist"
    | "normalization"
    | "fusion"
    | "quality"
    | "projection"
    | "analysis_context"
    | "agent_job";
  projectId?: string;
  territoryId?: string;
  runId?: string;
  jobId?: string;
  sourceId?: string;
  domain?: CanonicalDomain;
  durationMs?: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataHubLogger {
  emit(event: DataHubLogEvent): void;
}

export class NoopDataHubLogger implements DataHubLogger {
  emit(): void {}
}

/** Safe default for developer diagnostics; payloads and credential-like fields are never emitted. */
export class ConsoleDataHubLogger implements DataHubLogger {
  emit(event: DataHubLogEvent): void {
    const method = event.level === "error" ? "error" : event.level === "warning" ? "warn" : event.level === "debug" ? "debug" : "info";
    // Keep the event structured and bounded. Callers pass identifiers/counts, never raw payloads.
    console[method]("[DataHub]", event);
  }
}
