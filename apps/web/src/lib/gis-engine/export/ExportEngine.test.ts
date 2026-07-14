import { describe, expect, it } from "vitest";
import { createEmptyFormiqProject, createDefaultExportEngine, createDefaultExportRegistry, decodeUtf8 } from "@/lib";
import type {
  DataConfidence,
  FeatureLifecycleState,
  FeatureProvenance,
  FormiqBuilding,
  FormiqPoi,
  FormiqProjectData,
  FormiqRoad,
} from "@/types/formiq";

describe("ExportEngine", () => {
  it.each([
    ["geojson", "FeatureCollection"],
    ["csv", "building-1"],
    ["kml", "<kml"],
    ["dxf", "SECTION"],
    ["obj", "o building-1"],
    ["gltf", "\"asset\""],
    ["pdf", "%PDF-1.4"],
  ] as const)("exports %s from the internal FORMIQ model", async (format, expectedText) => {
    const result = await createDefaultExportEngine().exportProject(createProject(), { format });
    const text = decodeUtf8(result.data);

    expect(result.filename.endsWith(`.${format === "geojson" ? "geojson" : format}`)).toBe(true);
    expect(result.metadata.featureCount).toBe(3);
    expect(text).toContain(expectedText);
  });

  it("exports PNG with a valid PNG signature", async () => {
    const result = await createDefaultExportEngine().exportProject(createProject(), {
      format: "png",
      resolutionScale: 1,
      transparentBackground: true,
    });

    expect(Array.from(result.data.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.metadata.featureCount).toBe(3);
  });

  it("reports progress through the common export stages", async () => {
    const progress: string[] = [];
    await createDefaultExportEngine().exportProject(createProject(), { format: "geojson" }, (event) => {
      progress.push(event.stage);
    });

    expect(progress).toContain("prepare-project");
    expect(progress).toContain("prepare-data");
    expect(progress).toContain("write");
    expect(progress).toContain("done");
  });

  it("registers planned adapters without pretending they are implemented", async () => {
    const registry = createDefaultExportRegistry();

    expect(registry.require("pmtiles").label).toBe("PMTiles");
    await expect(registry.require("geopackage").export({
      project: createProject(),
      options: { format: "geopackage" },
      createdAt: new Date().toISOString(),
    })).rejects.toThrow("not implemented");
  });
});

function createProject(): FormiqProjectData {
  const project = createEmptyFormiqProject();
  return {
    ...project,
    id: "project-1",
    name: "Export Test",
    description: "Export integration test",
    author: "FORMIQ",
    crs: "EPSG:4326",
    metadata: {
      ...project.metadata,
      bounds: { west: 37.6, south: 55.7, east: 37.7, north: 55.8 },
    },
    buildings: [createBuilding()],
    roads: [createRoad()],
    poi: [createPoi()],
  };
}

function createBuilding(): FormiqBuilding {
  return {
    ...baseEntity("building-1", "building"),
    type: "building",
    geometry: {
      type: "polygon",
      rings: [[[37.6, 55.7], [37.61, 55.7], [37.61, 55.71], [37.6, 55.71], [37.6, 55.7]]],
    },
    height: 12,
    absoluteHeight: 12,
    relativeHeight: 12,
    heightFromLevels: 9.6,
    levels: 3,
    baseElevation: 0,
    area: 100,
    volume: 1200,
    year: 1990,
    usage: "residential",
    material: "brick",
    roof: "flat",
    objectType: "apartments",
    addressLabel: "Test street",
    semantic: {
      heightCategory: "low",
      ageCategory: "post-soviet",
      functionCategory: "residential",
      densityCategory: "small-footprint",
      importance: "medium",
      colorGroup: "building-low",
      transportRelation: "near",
      greenRelation: "near",
      isHistoric: false,
      isPublic: false,
      isResidential: true,
    },
    threeD: {
      absoluteHeight: 12,
      relativeHeight: 12,
      heightFromLevels: 9.6,
      baseElevation: 0,
      volume: 1200,
      whiteModel: {
        extrusionHeight: 12,
        extrusionMode: "absolute-height",
        baseElevation: 0,
        materialProfile: "white",
        colorSchemeId: "default",
      },
      semantic3D: {
        semanticColorGroup: "building-low",
        materialId: "building",
        renderPriority: 1,
      },
    },
  };
}

function createRoad(): FormiqRoad {
  return {
    ...baseEntity("road-1", "road"),
    type: "road",
    geometry: { type: "line", coordinates: [[37.6, 55.7], [37.7, 55.8]] },
    length: 1200,
    roadType: "primary",
    surface: "asphalt",
    name: "Road 1",
    lanes: 2,
    semantic: {
      importance: "high",
      lanes: 2,
      transportCategory: "city",
      colorGroup: "road-primary",
    },
  };
}

function createPoi(): FormiqPoi {
  return {
    ...baseEntity("poi-1", "poi"),
    type: "poi",
    geometry: { type: "point", coordinates: [37.65, 55.75] },
    category: "cafe",
    subtype: "coffee",
    name: "Cafe",
  };
}

function baseEntity(id: string, type: "building" | "road" | "poi") {
  return {
    id,
    type,
    tags: { source_name: "unit-test" },
    names: { default: id },
    source: "manual" as const,
    confidence: "high" as DataConfidence,
    provenance: emptyProvenance(id),
    lifecycleState: "active" as FeatureLifecycleState,
  };
}

function emptyProvenance(id: string): FeatureProvenance {
  return {
    primarySource: "manual",
    sourceFeatureIds: { manual: [id] },
    mergedSources: ["manual"],
    geometrySource: "manual",
    attributes: {},
    qualityScore: 1,
    confidence: "high",
  };
}
