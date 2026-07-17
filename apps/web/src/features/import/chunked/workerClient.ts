import { processFeaturesIntoChunks } from "@/lib/gis-engine/chunks";
import type { ChunkProcessingRequest, ChunkProcessingResult } from "@/lib/gis-engine/chunks";

export class TerritoryImportWorkerClient {
  private readonly worker: Worker | null;
  private readonly pending = new Map<string, { resolve: (result: ChunkProcessingResult) => void; reject: (error: Error) => void }>();
  private readonly fallbackSeen = new Map<string, Set<string>>();

  constructor() {
    this.worker = typeof Worker === "undefined"
      ? null
      : new Worker(new URL("./territoryImport.worker.ts", import.meta.url), { type: "module" });
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<ChunkProcessingResult>) => {
        const pending = this.pending.get(event.data.requestId);
        if (!pending) return;
        this.pending.delete(event.data.requestId);
        pending.resolve(event.data);
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || "Worker processing failed");
        this.pending.forEach(({ reject }) => reject(error));
        this.pending.clear();
      };
    }
  }

  resetSession(sessionId: string): void {
    this.fallbackSeen.set(sessionId, new Set());
    this.worker?.postMessage({ type: "reset", sessionId });
  }

  process(request: ChunkProcessingRequest, signal: AbortSignal): Promise<ChunkProcessingResult> {
    if (signal.aborted) return Promise.reject(new DOMException("Импорт отменён", "AbortError"));
    if (!this.worker) {
      const seen = this.fallbackSeen.get(request.sessionId) ?? new Set<string>();
      this.fallbackSeen.set(request.sessionId, seen);
      return Promise.resolve().then(() => processFeaturesIntoChunks(request, seen));
    }

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(request.requestId);
        reject(new DOMException("Импорт отменён", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.set(request.requestId, {
        resolve: (result) => {
          signal.removeEventListener("abort", abort);
          resolve(result);
        },
        reject,
      });
      this.worker!.postMessage(request);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.pending.clear();
  }
}
