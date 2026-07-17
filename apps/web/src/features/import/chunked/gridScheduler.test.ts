import { describe, expect, it } from "vitest";
import { createBoundingBoxGrid } from "@/lib/gis-engine/chunks";
import { runGridScheduler } from "./gridScheduler";

describe("runGridScheduler", () => {
  it("never exceeds three concurrent cells", async () => {
    const cells = createBoundingBoxGrid(
      { west: 37, south: 55, east: 37.5, north: 55.5 },
      { targetCellAreaSquareKilometers: 5, maxCellsPerAxis: 3 }
    );
    const controller = new AbortController();
    let active = 0;
    let maximumActive = 0;

    await runGridScheduler(cells, {
      concurrency: 9,
      signal: controller.signal,
      task: async (cell) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return cell.tileId;
      },
    });

    expect(maximumActive).toBe(3);
  });

  it("retries failed cells and reports their final status", async () => {
    const cells = createBoundingBoxGrid({ west: 37, south: 55, east: 37.01, north: 55.01 });
    const statuses: string[] = [];
    let attempts = 0;

    const result = await runGridScheduler(cells, {
      retries: 1,
      signal: new AbortController().signal,
      onCellStatus: (_cell, status) => statuses.push(status),
      task: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary");
        return "ok";
      },
    });

    expect(result).toEqual(["ok"]);
    expect(attempts).toBe(2);
    expect(statuses.at(-1)).toBe("ready");
  });

  it("aborts an active cell", async () => {
    const cells = createBoundingBoxGrid({ west: 37, south: 55, east: 37.01, north: 55.01 });
    const controller = new AbortController();
    const scheduled = runGridScheduler(cells, {
      signal: controller.signal,
      task: async (_cell, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      }),
    });

    controller.abort();
    await expect(scheduled).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not repeat errors already exhausted by a source adapter", async () => {
    const cells = createBoundingBoxGrid({ west: 37, south: 55, east: 37.01, north: 55.01 });
    let attempts = 0;

    await expect(runGridScheduler(cells, {
      retries: 2,
      signal: new AbortController().signal,
      task: async () => {
        attempts += 1;
        throw Object.assign(new Error("rate limit exhausted"), { retryable: false });
      },
    })).rejects.toThrow("rate limit exhausted");

    expect(attempts).toBe(1);
  });

  it("continues with other cells after a cell exhausts retries when requested", async () => {
    const cells = createBoundingBoxGrid(
      { west: 37, south: 55, east: 37.02, north: 55.01 },
      { targetCellAreaSquareKilometers: 1, maxCellsPerAxis: 2 }
    );
    const failedCell = cells[0];
    const completed: string[] = [];

    const result = await runGridScheduler(cells, {
      retries: 0,
      continueOnError: true,
      signal: new AbortController().signal,
      task: async (cell) => {
        if (cell.id === failedCell?.id) throw new Error("provider timeout");
        completed.push(cell.id);
        return cell.tileId;
      },
    });

    expect(result.filter(Boolean)).toHaveLength(cells.length - 1);
    expect(completed).toHaveLength(cells.length - 1);
  });
});
