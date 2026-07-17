import { afterEach, describe, expect, it, vi } from "vitest";
import { OverpassService } from "./OverpassService";

describe("OverpassService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes concurrent requests to avoid endpoint bursts", async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(200, { elements: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OverpassService({ minRequestIntervalMs: 0 });

    await Promise.all([
      service.query("query-1"),
      service.query("query-2"),
      service.query("query-3"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maximumActive).toBe(1);
  });

  it("retries HTTP 429 and honors a zero Retry-After value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}, { "Retry-After": "0" }))
      .mockResolvedValueOnce(response(200, { elements: [{ id: 1, type: "node" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new OverpassService({
      minRequestIntervalMs: 0,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const result = await service.query("query");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.elements).toHaveLength(1);
  });

  it("keeps the queue usable after a failed request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(400, {}))
      .mockResolvedValueOnce(response(200, { elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new OverpassService({ minRequestIntervalMs: 0, maxAttempts: 1 });

    await expect(service.query("invalid")).rejects.toMatchObject({
      name: "OverpassRequestError",
      retryable: false,
      status: 400,
    });
    await expect(service.query("valid")).resolves.toEqual({ elements: [] });
  });
});

function response(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => payload,
  } as Response;
}
