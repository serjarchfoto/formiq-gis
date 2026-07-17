import {
  createBoundingBoxGrid,
  createDefaultSourceAdapter,
  DataFusionEngine,
  layerChunkStorage,
} from "@/lib";
import type {
  ChunkedImportManifest,
  ImportGridCell,
  LayerChunkManifest,
  LayerChunkType,
} from "@/lib";
import type { SourceAdapter, SourceAdapterResult } from "@/lib/gis-engine/fusion/types";
import { useImportStore } from "@/store/import";
import type { BoundingBox } from "@/types/gis";
import type { ImportSourceId, ProjectDataSource, SourceSyncState } from "@/types/formiq";
import type { DataFusionResult } from "@/lib/gis-engine/fusion/types";
import { runGridScheduler, isAbortError } from "./gridScheduler";
import { TerritoryImportWorkerClient } from "./workerClient";

export interface ChunkedTerritoryImportOptions {
  projectId: string;
  bounds: BoundingBox;
  sources: ImportSourceId[];
  onChunkPersisted?: (manifest: LayerChunkManifest) => void;
  onProjectUpdate?: (fusionResult: DataFusionResult) => void | Promise<void>;
}

let activeController: AbortController | null = null;
let activeWorker: TerritoryImportWorkerClient | null = null;

export async function importTerritoryInChunks(
  options: ChunkedTerritoryImportOptions
): Promise<ChunkedImportManifest> {
  cancelChunkedTerritoryImport();
  const controller = new AbortController();
  const worker = new TerritoryImportWorkerClient();
  const sessionId = createId();
  const cells = createBoundingBoxGrid(options.bounds);
  const importStore = useImportStore.getState();
  const adapters = new Map(
    options.sources.map((source) => [source, createDefaultSourceAdapter(source)] as const)
  );
  const manifests: LayerChunkManifest[] = [];
  const featureCounts: Partial<Record<LayerChunkType, number>> = {};
  const featuresBySource = new Map<ImportSourceId, SourceAdapterResult["features"]>();
  let downloadedSources = 0;
  let completedCells = 0;
  const reportProgress = createThrottledReporter((progress) =>
    useImportStore.getState().setProgress(progress)
  );

  activeController = controller;
  activeWorker = worker;
  worker.resetSession(sessionId);
  importStore.start(sessionId, options.projectId, cells, cells.length * options.sources.length);
  await layerChunkStorage.deleteProjectChunks(options.projectId);
  clearImportPerformanceMarks();
  mark("territory-import-start");

  try {
    await runGridScheduler(cells, {
      concurrency: 3,
      retries: 2,
      // A transient provider failure (for example Overpass 504) must not
      // discard chunks that were already downloaded from the other cells.
      continueOnError: true,
      signal: controller.signal,
      onCellStatus: (cell, status, error) => {
        useImportStore.getState().updateCell(cell, status, error);
        if (status === "error") {
          completedCells += 1;
          reportProgress({ completedCells });
        }
      },
      task: async (cell, signal) => {
        await importCell({
          cell,
          options,
          sessionId,
          adapters,
          worker,
          signal,
          onDownloaded: () => {
            downloadedSources += 1;
            reportProgress({ downloadedSources });
          },
          onChunk: async (chunk) => {
            const manifest = await layerChunkStorage.saveChunk(chunk);
            manifests.push(manifest);
            featureCounts[manifest.layerType] =
              (featureCounts[manifest.layerType] ?? 0) + manifest.featureCount;
            useImportStore.getState().addManifest(manifest);
            reportProgress({
              persistedChunks: manifests.length,
              totalChunks: manifests.length,
            });
            options.onChunkPersisted?.(manifest);
          },
          onFeatures: (features) => {
            const source = features[0]?.source;
            if (!source) return;
            const current = featuresBySource.get(source as ImportSourceId) ?? [];
            featuresBySource.set(source as ImportSourceId, [...current, ...features]);
          },
        });
        completedCells += 1;
        reportProgress({ completedCells });
      },
    });

    reportProgress.flush();
    useImportStore.getState().setPhase("rendering");
    useImportStore.getState().setProgress({ totalChunks: manifests.length });
    mark("territory-import-persisted");
    measure("territory-import-to-persisted", "territory-import-start", "territory-import-persisted");

    if (manifests.length === 0) {
      await nextFrame();
      useImportStore.getState().setPhase("completed");
      useImportStore.getState().setProgress({ renderedChunks: 0, totalChunks: 0 });
    }

    const fusionResult = buildChunkedFusionResult(options, featuresBySource);
    await options.onProjectUpdate?.(fusionResult);

    return {
      version: 1,
      bounds: options.bounds,
      chunkIds: manifests.map((manifest) => manifest.id),
      featureCounts,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      useImportStore.getState().cancel();
      throw new DOMException("Импорт отменён", "AbortError");
    }
    controller.abort();
    const message = error instanceof Error ? error.message : "Импорт территории не завершён";
    useImportStore.getState().fail(message);
    throw error;
  } finally {
    reportProgress.flush();
    worker.terminate();
    if (activeController === controller) activeController = null;
    if (activeWorker === worker) activeWorker = null;
  }
}

export function cancelChunkedTerritoryImport(): void {
  const hadActiveImport = Boolean(activeController);
  activeController?.abort();
  activeWorker?.terminate();
  activeController = null;
  activeWorker = null;
  if (hadActiveImport) useImportStore.getState().cancel();
}

async function importCell({
  cell,
  options,
  sessionId,
  adapters,
  worker,
  signal,
  onDownloaded,
  onChunk,
  onFeatures,
}: {
  cell: ImportGridCell;
  options: ChunkedTerritoryImportOptions;
  sessionId: string;
  adapters: Map<ImportSourceId, SourceAdapter | null>;
  worker: TerritoryImportWorkerClient;
  signal: AbortSignal;
  onDownloaded: () => void;
  onChunk: (chunk: import("@/lib").LayerChunkRecord) => Promise<void>;
  onFeatures: (features: SourceAdapterResult["features"]) => void;
}): Promise<void> {
  for (const source of options.sources) {
    throwIfAborted(signal);
    let downloadReported = false;
    const reportDownloaded = () => {
      if (downloadReported) return;
      downloadReported = true;
      onDownloaded();
    };

    try {
      useImportStore.getState().setPhase("downloading");
      const fetchStart = `territory-fetch-start:${cell.tileId}:${source}`;
      const fetchEnd = `territory-fetch-end:${cell.tileId}:${source}`;
      mark(fetchStart);
      const adapter = adapters.get(source);
      if (!adapter) {
        reportDownloaded();
        continue;
      }
      const rawResult = adapter.fetchRaw
        ? await adapter.fetchRaw({ bounds: cell.bounds, signal })
        : await adapter.fetch({ bounds: cell.bounds, signal }).then((result) => ({
            source: result.source,
            version: result.version,
            payload: { format: "source-features" as const, features: result.features },
            metadata: result.metadata,
          }));
      mark(fetchEnd);
      measure(`territory-fetch:${cell.tileId}:${source}`, fetchStart, fetchEnd);
      reportDownloaded();

      const status = String(rawResult.metadata?.status ?? "ready");
      if (status === "error" || status === "offline") {
        throw new Error(String(rawResult.metadata?.message || `${source} недоступен`));
      }
      if (status !== "ready" && status !== "partial") continue;
      if (status === "partial" && rawResult.metadata?.message) {
        useImportStore.getState().updateCell(cell, "downloading", String(rawResult.metadata.message));
      }

      useImportStore.getState().setPhase("processing");
      useImportStore.getState().updateCell(cell, "processing");
      const processingStart = `territory-worker-processing-start:${cell.tileId}:${source}`;
      const processingEnd = `territory-worker-processing-end:${cell.tileId}:${source}`;
      mark(processingStart);
      const processed = await worker.process({
        requestId: createId(),
        sessionId,
        projectId: options.projectId,
        tileId: cell.tileId,
        source,
        payload: rawResult.payload,
      }, signal);
      mark(processingEnd);
      measure(`territory-worker-processing:${cell.tileId}:${source}`, processingStart, processingEnd);
      recordDuration("territory-worker-processing", processed.processingDurationMs);
      recordDuration("territory-deduplication", processed.deduplicationDurationMs);
      onFeatures(processed.features);

      useImportStore.getState().setPhase("persisting");
      useImportStore.getState().updateCell(cell, "persisting");
      for (const chunk of processed.chunks) {
        throwIfAborted(signal);
        await onChunk(chunk);
      }
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw new DOMException("Импорт отменён", "AbortError");
      }
      reportDownloaded();
      const message = error instanceof Error ? error.message : `${source}: ошибка импорта`;
      useImportStore.getState().updateCell(cell, "downloading", `${source}: ${message}`);
    }
  }
}

function buildChunkedFusionResult(
  options: ChunkedTerritoryImportOptions,
  featuresBySource: Map<ImportSourceId, SourceAdapterResult["features"]>
): DataFusionResult {
  const sourceResults: SourceAdapterResult[] = options.sources.map((source) => ({
    source,
    version: "chunked-import-v1",
    features: featuresBySource.get(source) ?? [],
    metadata: {
      status: "ready",
      featureCount: featuresBySource.get(source)?.length ?? 0,
    },
  }));
  const sourceStates: SourceSyncState[] = sourceResults.map((result) => ({
    source: result.source,
    status: "ready",
    updatedAt: new Date().toISOString(),
    version: result.version,
    featureCount: result.features.length,
    cacheHit: false,
    errorMessage: null,
  }));
  const dataSources: ProjectDataSource[] = sourceResults.map((result) => ({
    id: `chunked-${result.source}`,
    name: result.source,
    kind: result.source,
    connectedAt: new Date().toISOString(),
    status: "active",
    version: result.version,
    featureCount: result.features.length,
    errorMessage: null,
  }));

  return new DataFusionEngine().fuseSourceResults(
    options.bounds,
    sourceResults,
    sourceStates,
    dataSources
  );
}

function createThrottledReporter(
  report: (progress: Parameters<ReturnType<typeof useImportStore.getState>["setProgress"]>[0]) => void
) {
  let lastReportedAt = 0;
  let pending: Parameters<ReturnType<typeof useImportStore.getState>["setProgress"]>[0] = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (Object.keys(pending).length === 0) return;
    report(pending);
    pending = {};
    lastReportedAt = Date.now();
  };
  const enqueue = (progress: typeof pending) => {
    pending = { ...pending, ...progress };
    const wait = Math.max(0, 120 - (Date.now() - lastReportedAt));
    if (wait === 0) flush();
    else if (!timer) timer = setTimeout(flush, wait);
  };
  enqueue.flush = flush;
  return enqueue;
}

function mark(name: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMarks(name);
  performance.mark(name);
}

function clearImportPerformanceMarks(): void {
  if (typeof performance === "undefined") return;
  performance.clearMarks("first-interactive-map");
  performance.clearMarks("all-visible-layers-ready");
}

function measure(name: string, start: string, end: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMeasures(name);
  performance.measure(name, start, end);
}

function recordDuration(name: string, duration: number): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  if (!Number.isFinite(duration) || duration < 0) return;

  // `PerformanceMeasureOptions` requires `start` or `end`; `duration` is not
  // a supported option in browsers. Use a synthetic numeric range so the
  // resulting entry preserves the duration reported by the worker.
  const start = performance.now();
  performance.clearMeasures(name);
  performance.measure(name, { start, end: start + duration });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Импорт отменён", "AbortError");
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
