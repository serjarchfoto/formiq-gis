"use client";

import { create } from "zustand";
import { DEFAULT_OSM_LAYER_STYLES } from "@/constants/gis";
import { SpatialImportPipeline, type SpatialImportFormat } from "@/features/import/spatial-import";
import { createPMTilesFileSource } from "@/lib/gis-engine/pmtiles";
import { useProjectStore } from "@/store/project";
import { useMapStore } from "@/store/map";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GISImportFormat, GISLayer, GISLayerCategory, GISLayerGeometryType } from "@/types/gis";
import type { ProjectLayerState } from "@/types/formiq";

export type LayerItem = GISLayer;

export type AddLayerInput =
  | File
  | FeatureCollection<Geometry, GeoJsonProperties>
  | GISLayer
  | {
      name: string;
      data: FeatureCollection<Geometry, GeoJsonProperties>;
      sourceType?: GISImportFormat | "manual";
    };

interface LayersStore {
  layers: LayerItem[];
  hydrateFromProject: (layers: ProjectLayerState[]) => void;
  toggleLayer: (id: string) => void;
  setLayerOpacity: (id: string, value: number) => void;
  toggleLayerLock: (id: string) => void;
  addLayer: (fileOrData: AddLayerInput) => Promise<LayerItem>;
  upsertLayers: (layers: LayerItem[]) => void;
  removeLayer: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
}

const defaultLayers: LayerItem[] = [
  createDefaultLayer(0, "buildings", "Buildings", "polygon"),
  createDefaultLayer(1, "roads", "Roads", "line"),
  createDefaultLayer(2, "green", "Green", "polygon"),
  createDefaultLayer(3, "water", "Water", "polygon"),
];

export const useLayers = create<LayersStore>((set, get) => ({
  layers: defaultLayers,

  hydrateFromProject: (layers) => {
    set({
      layers: layers.length
        ? layers.map((layer, index) => normalizeLayer(layer, index))
        : defaultLayers,
    });
  },

  toggleLayer: (id) =>
    setAndPersist(set, get().layers.map((layer) =>
      layer.id === id ? { ...layer, visible: !layer.visible } : layer
    )),

  setLayerOpacity: (id, value) =>
    setAndPersist(set, get().layers.map((layer) =>
      layer.id === id && !layer.locked
        ? {
            ...layer,
            opacity: value,
            style: {
              ...layer.style,
              opacity: value,
            },
          }
        : layer
    )),

  toggleLayerLock: (id) =>
    setAndPersist(set, get().layers.map((layer) =>
      layer.id === id ? { ...layer, locked: !layer.locked } : layer
    )),

  addLayer: async (fileOrData) => {
    const layers = await createLayersFromInput(fileOrData, get().layers.length);
    const nextLayers = normalizeLayerOrder([...get().layers, ...layers]);

    setAndPersist(set, nextLayers);

    return layers[0];
  },

  upsertLayers: (layers) => {
    const nextLayers = [...get().layers];

    layers.forEach((layer) => {
      const existingIndex = nextLayers.findIndex((item) => item.id === layer.id);
      const normalizedLayer = normalizeLayer(layer, existingIndex >= 0 ? existingIndex : nextLayers.length);

      if (existingIndex >= 0) {
        nextLayers[existingIndex] = {
          ...nextLayers[existingIndex],
          ...normalizedLayer,
          removable: false,
          sourceType: "fusion",
        };
        return;
      }

      nextLayers.push({
        ...normalizedLayer,
        removable: false,
        sourceType: "fusion",
      });
    });

    setAndPersist(set, normalizeLayerOrder(nextLayers));
  },

  removeLayer: (id) => {
    const layer = get().layers.find((item) => item.id === id);

    if (!layer?.removable || layer.locked) {
      return;
    }

    if (layer.sourceType === "pmtiles") {
      useMapStore.getState().removePMTilesSource(layer.source.id);
    }

    setAndPersist(set, normalizeLayerOrder(get().layers.filter((item) => item.id !== id)));
  },

  moveLayer: (id, direction) => {
    const layers = [...get().layers].sort((left, right) => left.order - right.order);
    const index = layers.findIndex((layer) => layer.id === id);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length || layers[index]?.locked) {
      return;
    }

    [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];
    setAndPersist(set, normalizeLayerOrder(layers));
  },
}));

function setAndPersist(
  set: (partial: Partial<LayersStore>) => void,
  layers: LayerItem[]
): void {
  const orderedLayers = normalizeLayerOrder(layers);
  set({ layers: orderedLayers });
  persistLayers(orderedLayers);
}

function persistLayers(layers: LayerItem[]): void {
  const { project, setProject } = useProjectStore.getState();

  void setProject(project.id, {
    ...project,
    layerSystem: layers,
  });
}

function normalizeLayer(layer: ProjectLayerState | LayerItem, index: number): LayerItem {
  const opacity = layer.opacity ?? layer.style.opacity ?? 1;

  return {
    ...layer,
    opacity,
    groupId: layer.groupId ?? getDefaultLayerGroup(layer),
    locked: layer.locked ?? !layer.removable,
    sourceType: layer.sourceType ?? (layer.source.format === "osm" ? "osm" : layer.source.format),
    removable: layer.removable ?? false,
    order: layer.order ?? index,
    style: {
      ...layer.style,
      opacity,
    },
  };
}

function normalizeLayerOrder(layers: LayerItem[]): LayerItem[] {
  return layers
    .map((layer, index) => ({ ...normalizeLayer(layer, index), order: index }))
    .sort((left, right) => left.order - right.order);
}

async function createLayersFromInput(input: AddLayerInput, order: number): Promise<LayerItem[]> {
  if (isGISLayer(input)) {
    return [normalizeLayer({ ...input, removable: input.removable ?? true }, order)];
  }

  if (isFileInput(input)) {
    if (isPMTilesFile(input)) {
      return [createPMTilesLayer(input, order)];
    }

    return parseLayerFile(input, order);
  }

  if (isFeatureCollectionInput(input)) {
    return [createCustomLayer("Imported layer", input, "manual", order)];
  }

  return [createCustomLayer(input.name, input.data, input.sourceType ?? "manual", order)];
}

function createPMTilesLayer(file: File, order: number): LayerItem {
  const id = createLayerId();
  const name = file.name.replace(/\.[^.]+$/, "");
  const source = createPMTilesFileSource(id, file, name);

  useMapStore.getState().addPMTilesSource(source);

  return {
    id,
    name,
    visible: true,
    opacity: 0.85,
    sourceType: "pmtiles",
    removable: true,
    order,
    category: "custom",
    geometryType: "polygon",
    source: {
      id,
      name,
      format: "pmtiles",
    },
    style: {
      fillColor: "#229ED9",
      lineColor: "#1D8CC2",
      lineWidth: 1.5,
      opacity: 0.85,
    },
  };
}

function createCustomLayer(
  name: string,
  data: FeatureCollection<Geometry, GeoJsonProperties>,
  sourceType: GISImportFormat | "manual",
  order: number
): LayerItem {
  return {
    id: createLayerId(),
    name,
    visible: true,
    opacity: 0.75,
    sourceType,
    removable: true,
    order,
    category: "custom",
    geometryType: detectGeometryType(data),
    source: {
      id: createLayerId(),
      name,
      format: sourceType === "manual" ? "geojson" : sourceType,
    },
    data,
    style: {
      fillColor: "#229ED9",
      lineColor: "#1D8CC2",
      lineWidth: 2,
      opacity: 0.75,
    },
  };
}

async function parseLayerFile(file: File, order: number): Promise<LayerItem[]> {
  const sourceType = getFileSourceType(file);
  const binaryFormats: GISImportFormat[] = ["shapefile", "geopackage"];
  const payload = binaryFormats.includes(sourceType)
    ? await file.arrayBuffer()
    : await readFileAsText(file);
  const result = await new SpatialImportPipeline().run([
    {
      id: createLayerId(),
      name: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      format: sourceType as SpatialImportFormat,
      payload,
      options: {
        layerName: file.name.replace(/\.[^.]+$/, ""),
      },
    },
  ]);

  const errors = result.datasets.flatMap((dataset) => dataset.metadata.messages);

  if (!result.layers.length) {
    throw new Error(errors[0] ?? "Unsupported layer format");
  }

  return result.layers.map((layer, index) =>
    normalizeLayer(
      {
        ...layer,
        order: order + index,
        groupId: getDefaultLayerGroup(layer),
        locked: false,
      },
      order + index
    )
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function getFileSourceType(file: File): GISImportFormat {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "geojson" || extension === "json") return "geojson";
  if (extension === "kml") return "kml";
  if (extension === "gpx") return "gpx";
  if (extension === "csv") return "csv";
  if (extension === "dxf") return "dxf";
  if (extension === "gpkg" || extension === "geopackage") return "geopackage";
  if (extension === "zip" || extension === "shp") return "shapefile";

  return "geojson";
}

function isPMTilesFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pmtiles");
}

function detectGeometryType(data: FeatureCollection<Geometry, GeoJsonProperties>): GISLayerGeometryType {
  const geometryType = data.features.find((feature) => feature.geometry)?.geometry?.type;

  if (geometryType === "Point" || geometryType === "MultiPoint") return "point";
  if (geometryType === "LineString" || geometryType === "MultiLineString") return "line";

  return "polygon";
}

function createDefaultLayer(
  order: number,
  category: Extract<GISLayerCategory, "buildings" | "roads" | "green" | "water">,
  name: string,
  geometryType: GISLayerGeometryType
): LayerItem {
  const style = DEFAULT_OSM_LAYER_STYLES[category];

  return {
    id: category,
    name,
    visible: true,
    opacity: style.opacity ?? 1,
    groupId: "base",
    locked: true,
    sourceType: "osm",
    removable: false,
    order,
    category,
    geometryType,
    source: {
      id: `default-osm-${category}`,
      name: "OpenStreetMap",
      format: "osm",
    },
    style,
  };
}

function getDefaultLayerGroup(layer: Pick<GISLayer, "category" | "sourceType">): string {
  if (layer.sourceType === "osm" || layer.sourceType === "fusion") return "base";
  if (layer.category === "custom") return "imports";
  return layer.category;
}

function createLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isGISLayer(input: AddLayerInput): input is GISLayer {
  return Boolean(input && typeof input === "object" && "id" in input && "source" in input);
}

function isFileInput(input: AddLayerInput): input is File {
  return typeof File !== "undefined" && input instanceof File;
}

function isFeatureCollectionInput(
  input: AddLayerInput
): input is FeatureCollection<Geometry, GeoJsonProperties> {
  return Boolean(input && typeof input === "object" && "type" in input && input.type === "FeatureCollection");
}
