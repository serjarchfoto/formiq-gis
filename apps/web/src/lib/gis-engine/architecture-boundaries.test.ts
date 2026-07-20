import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("FORMIQ legacy cleanup boundaries", () => {
  it("keeps the user import path on ImportPipeline/Data Hub", () => {
    expect(read("features/import/importPipeline.ts")).not.toMatch(/osmImport|OverpassService|OSMService/);
    expect(read("features/import/osmImport.ts")).not.toMatch(/OverpassService|OSMService/);
  });

  it("does not allow Data Hub ingestion to call the legacy normalizer", () => {
    expect(read("lib/gis-engine/data-hub/IngestionPipeline.ts")).not.toMatch(/osmNormalizer|normalizeOSMResponseToFormiqLayers/);
    expect(read("lib/gis-engine/data-hub/NormalizationPipeline.ts")).not.toMatch(/osmNormalizer/);
  });

  it("keeps analysis and projections independent from source fallbacks", () => {
    const workspace = read("features/analysis/components/AnalysisWorkspace.tsx");
    expect(workspace).not.toMatch(/fusion\.collections|SourceRegistry|providers\//);
    expect(workspace).not.toMatch(/useState<CanonicalSnapshot|setCanonicalSnapshot/);
    expect(read("lib/gis-engine/projectBuilder.ts")).not.toMatch(/OverpassService|OSMService/);
    expect(read("lib/gis-engine/data-hub/DataHubQueryService.ts")).not.toMatch(/providers\//);
  });

  it("keeps normalizers free of UI state dependencies", () => {
    expect(read("lib/gis-engine/data-hub/normalizers/BaseSourceNormalizer.ts")).not.toMatch(/store|components\//);
    expect(read("lib/gis-engine/data-hub/normalizers/OSMSourceNormalizer.ts")).not.toMatch(/store|components\//);
    expect(read("lib/gis-engine/data-hub/normalizers/GenericGeoJsonNormalizer.ts")).not.toMatch(/store|components\//);
  });

  it("does not ship mock-success source connectors in production providers", () => {
    const providerRoot = resolve(root, "lib/gis-engine/fusion/providers");
    const productionSources = readdirSync(providerRoot).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    for (const name of productionSources) expect(readFileSync(resolve(providerRoot, name), "utf8")).not.toMatch(/class\s+(Mock|Fake|Fixture)\w*(Adapter|Source)/);
  });
});
