import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterFeatureCollectionByBbox,
  parseBboxParam,
  readGeoJsonDatasetPath,
  readGeoJsonFile,
} from "./readGeoJsonDataset";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("readGeoJsonDataset", () => {
  it("reads a FeatureCollection and filters features by bbox", async () => {
    const filePath = await writeDataset({
      type: "FeatureCollection",
      features: [
        polygonFeature("inside", 37.617, 55.755),
        polygonFeature("outside", 30, 60),
      ],
    });

    const dataset = await readGeoJsonFile(filePath);
    const filtered = filterFeatureCollectionByBbox(dataset, [37.61, 55.75, 37.62, 55.76]);

    expect(dataset.features).toHaveLength(2);
    expect(filtered.features).toHaveLength(1);
    expect(filtered.features[0]?.id).toBe("inside");
  });

  it.each([
    ["Feature array", [polygonFeature("array", 37.617, 55.755)]],
    ["single Feature", polygonFeature("single", 37.617, 55.755)],
  ])("normalizes %s into a FeatureCollection", async (_label, input) => {
    const filePath = await writeDataset(input);
    const dataset = await readGeoJsonFile(filePath);

    expect(dataset.type).toBe("FeatureCollection");
    expect(dataset.features).toHaveLength(1);
  });

  it("returns an empty FeatureCollection for a missing file", async () => {
    const dataset = await readGeoJsonFile(path.join(tmpdir(), "formiq-missing.geojson"));

    expect(dataset).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("combines all GeoJSON files from a dataset directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "formiq-data-proxy-directory-"));
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, "roads.geojson"),
      JSON.stringify([polygonFeature("first", 37.617, 55.755)]),
      "utf8"
    );
    await writeFile(
      path.join(directory, "water.json"),
      JSON.stringify(polygonFeature("second", 37.618, 55.756)),
      "utf8"
    );
    await writeFile(path.join(directory, "ignored.txt"), "not geojson", "utf8");

    const dataset = await readGeoJsonDatasetPath(directory);

    expect(dataset.files).toHaveLength(2);
    expect(dataset.collection.features).toHaveLength(2);
    expect(dataset.collection.features[0]?.properties?.["_formiq:dataset"]).toBe(
      "roads.geojson"
    );
  });

  it("validates bbox query values", () => {
    expect(parseBboxParam("37.61,55.75,37.62,55.76")).toEqual([
      37.61, 55.75, 37.62, 55.76,
    ]);
    expect(parseBboxParam("37.62,55.75,37.61,55.76")).toBeNull();
    expect(parseBboxParam("invalid")).toBeNull();
  });
});

async function writeDataset(data: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "formiq-data-proxy-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "dataset.geojson");
  await writeFile(filePath, JSON.stringify(data), "utf8");
  return filePath;
}

function polygonFeature(id: string, longitude: number, latitude: number) {
  return {
    type: "Feature" as const,
    id,
    properties: { name: id },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [longitude, latitude],
          [longitude + 0.001, latitude],
          [longitude + 0.001, latitude + 0.001],
          [longitude, latitude + 0.001],
          [longitude, latitude],
        ],
      ],
    },
  };
}
