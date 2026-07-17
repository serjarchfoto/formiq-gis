import type { ImportGridCell, ImportGridCellStatus } from "@/lib/gis-engine/chunks";

export interface GridSchedulerOptions<T> {
  concurrency?: number;
  retries?: number;
  /** Keep processing other cells when one cell exhausts its retries. */
  continueOnError?: boolean;
  signal: AbortSignal;
  task: (cell: ImportGridCell, signal: AbortSignal) => Promise<T>;
  onCellStatus?: (cell: ImportGridCell, status: ImportGridCellStatus, error?: string) => void;
}

export async function runGridScheduler<T>(
  cells: ImportGridCell[],
  options: GridSchedulerOptions<T>
): Promise<T[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 3));
  const retries = Math.max(0, options.retries ?? 2);
  const results = new Array<T>(cells.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < cells.length) {
      throwIfAborted(options.signal);
      const index = cursor;
      cursor += 1;
      const cell = cells[index];
      let lastError: unknown;

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        throwIfAborted(options.signal);
        cell.attempts = attempt + 1;
        options.onCellStatus?.(cell, "downloading");
        try {
          results[index] = await options.task(cell, options.signal);
          options.onCellStatus?.(cell, "ready");
          lastError = null;
          break;
        } catch (error) {
          if (isAbortError(error) || options.signal.aborted) throw createAbortError();
          lastError = error;
          if (attempt < retries && isRetryableError(error)) {
            await retryDelay(attempt, options.signal);
          } else {
            break;
          }
        }
      }

      if (lastError) {
        const message = lastError instanceof Error ? lastError.message : "Ошибка импорта ячейки";
        options.onCellStatus?.(cell, "error", message);
        if (!options.continueOnError) {
          throw lastError;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, worker));
  return results;
}

function retryDelay(attempt: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, 350 * 2 ** attempt);
    signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      reject(createAbortError());
    }, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function createAbortError(): DOMException {
  return new DOMException("Импорт отменён", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRetryableError(error: unknown): boolean {
  return !(
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    error.retryable === false
  );
}
