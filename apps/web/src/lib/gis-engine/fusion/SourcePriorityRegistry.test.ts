import { describe, expect, it } from "vitest";
import { getRegisteredSourceIds, getSourcePriorityPlan, chooseBestSourceResult } from "./SourcePriorityRegistry";

describe("SourcePriorityRegistry", () => {
  it("keeps the Primary → Secondary → Fallback order", () => {
    expect(getSourcePriorityPlan("terrain").map((source) => source.priority)).toEqual([
      "primary",
      "secondary",
      "secondary",
      "fallback",
      "fallback",
      "fallback",
    ]);
  });

  it("only returns providers that have registered adapters", () => {
    expect(getRegisteredSourceIds("terrain", ["open-elevation", "copernicus-dem"])).toEqual([
      "copernicus-dem",
      "open-elevation",
    ]);
  });

  it("chooses the result with the largest usable collection", () => {
    const result = chooseBestSourceResult([
      { features: [{ id: 1 }] },
      { features: [{ id: 1 }, { id: 2 }] },
    ]);
    expect(result?.features).toHaveLength(2);
  });
});
