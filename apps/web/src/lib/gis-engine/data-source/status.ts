import type { DataSourceStatus } from "./types";

export function normalizeDataSourceStatus(status: unknown, featureCount = 0): DataSourceStatus {
  if (
    status === "ready" ||
    status === "loading" ||
    status === "not-configured" ||
    status === "rate-limited" ||
    status === "offline" ||
    status === "error"
  ) {
    return status;
  }

  if (status === "temporary-unavailable") {
    return "offline";
  }

  if (status === "empty" || status === "idle") {
    return featureCount > 0 ? "ready" : "not-configured";
  }

  return featureCount > 0 ? "ready" : "not-configured";
}

export function isUnavailableDataSourceStatus(status: DataSourceStatus): boolean {
  return status === "not-configured" || status === "rate-limited" || status === "offline" || status === "error";
}
