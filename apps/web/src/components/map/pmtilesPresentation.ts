import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { PMTilesAdapter, type OfflineTileSource } from "@/lib/gis-engine/pmtiles";
import type { SourceFeature } from "@/lib/gis-engine/fusion/types";
import type { BoundingBox, GISLayer } from "@/types/gis";

export type PresentationTileState = "loading" | "ready" | "visible" | "cached" | "evicted" | "error";

export interface PresentationViewport {
  zoom: number;
  bbox: BoundingBox;
  center: [number, number];
  bearing: number;
  pitch: number;
}

export interface PresentationTileCoordinate {
  z: number;
  x: number;
  y: number;
}

export interface PresentationTileRecord {
  key: string;
  sourceId: string;
  coordinate: PresentationTileCoordinate;
  state: PresentationTileState;
  features: SourceFeature[];
  lastUsed: number;
  errorMessage?: string;
}

export interface PMTilesPresentationStats {
  loadedTiles: number;
  visibleTiles: number;
  cachedTiles: number;
  decodedFeatures: number;
  frameTimeMs: number;
  fps: number;
  memoryMb: number | null;
  loadingTiles: number;
  erroredTiles: number;
}

interface PMTilesPresentationSource {
  source: OfflineTileSource;
  layer: GISLayer;
}

interface SchedulerTask {
  key: string;
  priority: number;
  run: () => Promise<void>;
}

const MAX_VISIBLE_TILE_ZOOM = 14;
const MAX_CACHED_TILES = 96;
const MAX_CONCURRENT_TILE_LOADS = 4;
const PRESENTATION_SOURCE_PREFIX = "formiq-pmtiles";

export class PMTilesViewportTileManager {
  private readonly tiles = new Map<string, PresentationTileRecord>();
  private readonly queue: SchedulerTask[] = [];
  private readonly loadingKeys = new Set<string>();
  private readonly adapter = new PMTilesAdapter();
  private activeLoads = 0;
  private lastFrameAt = performance.now();
  private frameTimeMs = 0;
  private fps = 0;

  async update(
    map: MapLibreMap,
    sources: PMTilesPresentationSource[],
    viewport: PresentationViewport,
  ): Promise<PMTilesPresentationStats> {
    const frameStart = performance.now();
    const visibleKeys = new Set<string>();
    const activeSourceIds = new Set(sources.map((item) => item.source.id));

    this.tiles.forEach((tile, key) => {
      if (!activeSourceIds.has(tile.sourceId)) {
        tile.state = "evicted";
        removePresentationTile(map, key);
        this.tiles.delete(key);
      }
    });

    for (const item of sources) {
      if (!item.layer.visible) {
        this.tiles.forEach((tile) => {
          if (tile.sourceId !== item.source.id) return;
          tile.state = "cached";
          if (map.getSource(getMapSourceId(tile.key))) {
            syncPMTilesLayers(map, getMapSourceId(tile.key), tile.key, item.layer);
          }
        });
        continue;
      }

      const metadata = await this.adapter.readMetadata(item.source);
      if (metadata.tileType !== "mvt") continue;

      const tileZoom = Math.max(metadata.minZoom, Math.min(metadata.maxZoom, Math.min(MAX_VISIBLE_TILE_ZOOM, Math.floor(viewport.zoom))));
      const coordinates = getTileCoordinatesForBbox(viewport.bbox, tileZoom);
      const centerTile = lonLatToTile(viewport.center[0], viewport.center[1], tileZoom);

      coordinates
        .map((coordinate) => ({
          coordinate,
          key: getPresentationTileKey(item.source.id, coordinate),
          priority: tileDistance(coordinate, centerTile),
        }))
        .sort((left, right) => left.priority - right.priority)
        .forEach(({ coordinate, key, priority }) => {
          visibleKeys.add(key);
          const existing = this.tiles.get(key);

          if (existing?.state === "ready" || existing?.state === "cached" || existing?.state === "visible") {
            existing.state = "visible";
            existing.lastUsed = Date.now();
            syncPMTilesMapSource(map, existing, item.layer);
            return;
          }

          if (existing?.state === "loading" || this.loadingKeys.has(key)) {
            return;
          }

          const record: PresentationTileRecord = existing ?? {
            key,
            sourceId: item.source.id,
            coordinate,
            state: "loading",
            features: [],
            lastUsed: Date.now(),
          };
          record.state = "loading";
          this.tiles.set(key, record);

          this.enqueue({
            key,
            priority,
            run: async () => {
              try {
                const features = await this.adapter.querySourceFeatures(item.source, tileToBbox(coordinate));
                record.features = features;
                record.state = visibleKeys.has(key) ? "visible" : "ready";
                record.lastUsed = Date.now();
                syncPMTilesMapSource(map, record, item.layer);
              } catch (error) {
                record.state = "error";
                record.errorMessage = error instanceof Error ? error.message : "PMTiles tile load failed";
              }
            },
          });
        });
    }

    this.tiles.forEach((tile, key) => {
      if (!visibleKeys.has(key) && tile.state === "visible") {
        tile.state = "cached";
      }
    });
    this.evict(map, visibleKeys);
    this.flushQueue();

    const now = performance.now();
    this.frameTimeMs = now - frameStart;
    const delta = now - this.lastFrameAt;
    this.fps = delta > 0 ? 1000 / delta : this.fps;
    this.lastFrameAt = now;

    return this.getStats();
  }

  getStats(): PMTilesPresentationStats {
    const records = Array.from(this.tiles.values());
    return {
      loadedTiles: records.filter((tile) => tile.state === "ready" || tile.state === "visible" || tile.state === "cached").length,
      visibleTiles: records.filter((tile) => tile.state === "visible").length,
      cachedTiles: records.filter((tile) => tile.state === "cached").length,
      decodedFeatures: records.reduce((total, tile) => total + tile.features.length, 0),
      frameTimeMs: Math.round(this.frameTimeMs),
      fps: Math.round(this.fps),
      memoryMb: getMemoryUsageMb(),
      loadingTiles: records.filter((tile) => tile.state === "loading").length,
      erroredTiles: records.filter((tile) => tile.state === "error").length,
    };
  }

  clear(map: MapLibreMap): void {
    Array.from(this.tiles.keys()).forEach((key) => removePresentationTile(map, key));
    this.tiles.clear();
    this.queue.length = 0;
    this.loadingKeys.clear();
    this.activeLoads = 0;
  }

  private enqueue(task: SchedulerTask): void {
    if (this.queue.some((candidate) => candidate.key === task.key)) return;
    this.queue.push(task);
    this.queue.sort((left, right) => left.priority - right.priority);
  }

  private flushQueue(): void {
    while (this.activeLoads < MAX_CONCURRENT_TILE_LOADS && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task || this.loadingKeys.has(task.key)) continue;

      this.activeLoads += 1;
      this.loadingKeys.add(task.key);
      void task.run().finally(() => {
        this.loadingKeys.delete(task.key);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        this.flushQueue();
      });
    }
  }

  private evict(map: MapLibreMap, visibleKeys: Set<string>): void {
    const cached = Array.from(this.tiles.values())
      .filter((tile) => !visibleKeys.has(tile.key) && tile.state === "cached")
      .sort((left, right) => left.lastUsed - right.lastUsed);

    while (this.tiles.size > MAX_CACHED_TILES && cached.length > 0) {
      const tile = cached.shift();
      if (!tile) break;
      tile.state = "evicted";
      removePresentationTile(map, tile.key);
      this.tiles.delete(tile.key);
    }
  }
}

export function createPMTilesPresentationSources(
  pmTilesSources: OfflineTileSource[],
  layers: GISLayer[],
): PMTilesPresentationSource[] {
  const layerBySourceId = new Map(layers.filter((layer) => layer.sourceType === "pmtiles").map((layer) => [layer.source.id, layer]));
  return pmTilesSources
    .map((source) => {
      const layer = layerBySourceId.get(source.id);
      return layer ? { source, layer } : null;
    })
    .filter((source): source is PMTilesPresentationSource => Boolean(source));
}

function syncPMTilesMapSource(map: MapLibreMap, tile: PresentationTileRecord, layer: GISLayer): void {
  const sourceId = getMapSourceId(tile.key);
  const collection = sourceFeaturesToFeatureCollection(tile.features);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: collection,
    });
  } else {
    (map.getSource(sourceId) as GeoJSONSource).setData(collection);
  }

  syncPMTilesLayers(map, sourceId, tile.key, layer);
}

function syncPMTilesLayers(map: MapLibreMap, sourceId: string, key: string, layer: GISLayer): void {
  const fillLayerId = `${sourceId}-fill`;
  const lineLayerId = `${sourceId}-line`;
  const pointLayerId = `${sourceId}-point`;
  const visibility = layer.visible ? "visible" : "none";

  if (!map.getLayer(fillLayerId)) {
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: {
        "fill-color": layer.style.fillColor ?? "#229ED9",
        "fill-opacity": layer.opacity,
      },
    });
  }

  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
      paint: {
        "line-color": layer.style.lineColor ?? "#1D8CC2",
        "line-width": layer.style.lineWidth ?? 1.5,
        "line-opacity": layer.opacity,
      },
    });
  }

  if (!map.getLayer(pointLayerId)) {
    map.addLayer({
      id: pointLayerId,
      type: "circle",
      source: sourceId,
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-color": layer.style.fillColor ?? "#F97316",
        "circle-radius": 4,
        "circle-opacity": layer.opacity,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1,
      },
    });
  }

  map.setLayoutProperty(fillLayerId, "visibility", visibility);
  map.setLayoutProperty(lineLayerId, "visibility", visibility);
  map.setLayoutProperty(pointLayerId, "visibility", visibility);
  map.setPaintProperty(fillLayerId, "fill-opacity", layer.opacity);
  map.setPaintProperty(lineLayerId, "line-opacity", layer.opacity);
  map.setPaintProperty(pointLayerId, "circle-opacity", layer.opacity);
}

function removePresentationTile(map: MapLibreMap, key: string): void {
  const sourceId = getMapSourceId(key);
  [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-point`].forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function sourceFeaturesToFeatureCollection(features: SourceFeature[]): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: features.map<Feature<Geometry, GeoJsonProperties>>((feature) => ({
      type: "Feature",
      id: feature.sourceFeatureId,
      geometry: feature.geometry,
      properties: {
        ...feature.tags,
        id: feature.sourceFeatureId,
        type: feature.kind,
        category: feature.kind,
        "_formiq:source": feature.source,
        "_formiq:kind": feature.kind,
      },
    })),
  };
}

function getPresentationTileKey(sourceId: string, coordinate: PresentationTileCoordinate): string {
  return `${sourceId}-${coordinate.z}-${coordinate.x}-${coordinate.y}`;
}

function getMapSourceId(key: string): string {
  return `${PRESENTATION_SOURCE_PREFIX}-${key}`;
}

function getTileCoordinatesForBbox(bbox: BoundingBox, zoom: number): PresentationTileCoordinate[] {
  const max = 2 ** zoom - 1;
  const minX = clampInteger(lonToTileX(bbox.west, zoom), 0, max);
  const maxX = clampInteger(lonToTileX(bbox.east, zoom), 0, max);
  const minY = clampInteger(latToTileY(bbox.north, zoom), 0, max);
  const maxY = clampInteger(latToTileY(bbox.south, zoom), 0, max);
  const coordinates: PresentationTileCoordinate[] = [];

  for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x += 1) {
    for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y += 1) {
      coordinates.push({ z: zoom, x, y });
    }
  }

  return coordinates;
}

function tileToBbox(tile: PresentationTileCoordinate): BoundingBox {
  return {
    west: tileXToLon(tile.x, tile.z),
    east: tileXToLon(tile.x + 1, tile.z),
    north: tileYToLat(tile.y, tile.z),
    south: tileYToLat(tile.y + 1, tile.z),
  };
}

function lonLatToTile(longitude: number, latitude: number, zoom: number): PresentationTileCoordinate {
  return {
    z: zoom,
    x: lonToTileX(longitude, zoom),
    y: latToTileY(latitude, zoom),
  };
}

function lonToTileX(longitude: number, zoom: number): number {
  return Math.floor(((clamp(longitude, -180, 180) + 180) / 360) * 2 ** zoom);
}

function latToTileY(latitude: number, zoom: number): number {
  const lat = clamp(latitude, -85.05112878, 85.05112878);
  const radians = lat * Math.PI / 180;
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom);
}

function tileXToLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number): number {
  const value = Math.PI * (1 - 2 * y / 2 ** zoom);
  return Math.atan(Math.sinh(value)) * 180 / Math.PI;
}

function tileDistance(left: PresentationTileCoordinate, right: PresentationTileCoordinate): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getMemoryUsageMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null;
}
