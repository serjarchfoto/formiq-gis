import type { BoundingBox } from "@/types/gis";

export interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}

export interface OverpassElement {
  id: number;
  type: "node" | "way" | "relation";
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
  center?: OverpassGeometryPoint;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_250;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

export interface OverpassServiceOptions {
  endpoint?: string;
  minRequestIntervalMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export class OverpassRequestError extends Error {
  readonly retryable = false;

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OverpassRequestError";
  }
}

export class OverpassService {
  private readonly endpoint: string;
  private readonly minRequestIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(options: OverpassServiceOptions = {}) {
    this.endpoint = options.endpoint ?? OVERPASS_ENDPOINT;
    this.minRequestIntervalMs = Math.max(
      0,
      options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS
    );
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  }

  async loadArchitecturalContext(bbox: BoundingBox, signal?: AbortSignal): Promise<OverpassResponse> {
    const query = this.createArchitecturalContextQuery(bbox);

    return this.query(query, signal);
  }

  async query(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
    return this.enqueue(() => this.executeWithRetry(query, signal), signal);
  }

  private enqueue<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const scheduled = this.queue.then(async () => {
      throwIfAborted(signal);
      const waitBeforeRequest = Math.max(0, this.nextRequestAt - Date.now());
      if (waitBeforeRequest > 0) await abortableDelay(waitBeforeRequest, signal);

      try {
        return await task();
      } finally {
        this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
      }
    });

    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  private async executeWithRetry(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
    let lastStatus = 0;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      throwIfAborted(signal);
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ data: query }),
        signal,
      });
      lastStatus = response.status;

      if (response.ok) {
        return response.json() as Promise<OverpassResponse>;
      }

      if (!isRetryableStatus(response.status) || attempt === this.maxAttempts - 1) {
        break;
      }

      const retryAfterMs = parseRetryAfterMilliseconds(response.headers.get("Retry-After"));
      const exponentialDelayMs = Math.min(
        MAX_RETRY_DELAY_MS,
        this.retryDelayMs * 2 ** attempt
      );
      await abortableDelay(retryAfterMs ?? exponentialDelayMs, signal);
    }

    if (lastStatus === 429) {
      throw new OverpassRequestError(
        "Overpass временно ограничивает частоту запросов. Импорт можно повторить через несколько минут.",
        lastStatus
      );
    }

    throw new OverpassRequestError(`Overpass request failed with status ${lastStatus}.`, lastStatus);
  }

  private createArchitecturalContextQuery(bbox: BoundingBox): string {
    const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    return `
      [out:json][timeout:25];
      (
        node["public_transport"](${box});
        node["highway"="bus_stop"](${box});
        node["railway"~"station|halt|tram_stop|subway_entrance"](${box});
        node["amenity"](${box});
        way["building"](${box});
        way["highway"](${box});
        way["natural"="water"](${box});
        way["water"](${box});
        way["waterway"~"riverbank|canal"](${box});
        way["landuse"~"grass|forest|meadow|recreation_ground|village_green"](${box});
        way["leisure"~"park|garden"](${box});
        way["natural"~"wood|grassland|scrub"](${box});
      );
      out center geom;
    `;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function parseRetryAfterMilliseconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function abortableDelay(durationMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError(): DOMException {
  return new DOMException("Импорт отменён", "AbortError");
}
