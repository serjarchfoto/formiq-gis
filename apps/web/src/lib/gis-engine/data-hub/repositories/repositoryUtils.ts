export const RAW_PAYLOAD_WARNING_BYTES = 5 * 1024 * 1024;

export function cloneForStorage<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new Error("Data Hub record is not IndexedDB structured-clone compatible.", { cause: error });
  }
}

export function estimateSerializedBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

export function compareNewest(
  left: { createdAt?: string; startedAt?: string; version?: number; id: string },
  right: { createdAt?: string; startedAt?: string; version?: number; id: string }
): number {
  const leftDate = left.createdAt ?? left.startedAt ?? "";
  const rightDate = right.createdAt ?? right.startedAt ?? "";
  return (
    rightDate.localeCompare(leftDate) ||
    (right.version ?? 0) - (left.version ?? 0) ||
    right.id.localeCompare(left.id)
  );
}
