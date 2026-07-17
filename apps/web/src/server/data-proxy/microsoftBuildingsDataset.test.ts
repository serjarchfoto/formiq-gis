import { describe, expect, it } from "vitest";
import {
  DEFAULT_MICROSOFT_BUILDINGS_MAX_FEATURES,
  DEFAULT_MICROSOFT_BUILDINGS_MAX_FILES,
} from "./microsoftBuildingsDataset";

describe("Microsoft buildings dataset safety limits", () => {
  it("does not silently keep the former 1500-feature / two-partition cap", () => {
    expect(DEFAULT_MICROSOFT_BUILDINGS_MAX_FILES).toBeGreaterThanOrEqual(32);
    expect(DEFAULT_MICROSOFT_BUILDINGS_MAX_FEATURES).toBeGreaterThanOrEqual(250_000);
  });
});
