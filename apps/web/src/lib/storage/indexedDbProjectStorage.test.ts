import { describe, expect, it } from "vitest";
import { createFormiqProject } from "@/lib/gis-engine/projectBuilder";
import { prepareProjectForStorage } from "./indexedDbProjectStorage";

describe("project storage metadata", () => {
  it("computes a stable serialized size only when preparing a save", () => {
    const project = createFormiqProject({ name: "Storage size" });

    expect(project.metadata.serializedSize).toBeUndefined();

    const prepared = prepareProjectForStorage(project);
    const preparedAgain = prepareProjectForStorage(prepared);

    expect(prepared.metadata.serializedSize).toBeGreaterThan(0);
    expect(preparedAgain.metadata.serializedSize).toBe(prepared.metadata.serializedSize);
  });
});
