"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";
import { createRectangleCoordinates, createSelectionFeatureCollection } from "@/features/selection";
import {
  CartographicStyleEngine,
  formiqLayerDataToFeatureCollection,
  getCachedAnalysisTimestamp,
  isThematicMapDefinition,
  type ThematicMapDefinition,
} from "@/lib";
import { useLayers } from "@/store/layers";
import { useMapStore, type SelectedMapObject } from "@/store/map";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";
import type { GISLayer } from "@/types/gis";
import type {
  CartographicThemeId,
  FormiqEntity,
  FormiqProjectData,
} from "@/types/formiq";

const SELECTION_SOURCE_ID = "formiq-selection";
const SELECTION_FILL_LAYER_ID = "formiq-selection-fill";
const SELECTION_LINE_LAYER_ID = "formiq-selection-line";
const SELECTION_POINT_LAYER_ID = "formiq-selection-point";
const THEMATIC_SOURCE_ID = "thematic";
const THEMATIC_FILL_LAYER_ID = "thematic-fill";
const THEMATIC_LINE_LAYER_ID = "thematic-line";
const THEMATIC_POINT_LAYER_ID = "thematic-point";
const cartographicStyleEngine = new CartographicStyleEngine();

export default function Map() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rectangleStartRef = useRef<Position | null>(null);
  const renderedLayerIdsRef = useRef<Set<string>>(new Set());
  const thematicLayerTypeRef = useRef<string>("none");
  const isMapStyleReadyRef = useRef(false);
  const layers = useLayers((state) => state.layers);
  const project = useProjectStore((state) => state.project);
  const displaySettings = project.settings.display;
  const thematicMapType = displaySettings.activeThematicMapType;
  const thematicMap = useMemo(
    () => getCachedThematicMap(project, thematicMapType),
    [project, thematicMapType]
  );
  const thematicSourceHash = useMemo(
    () => getThematicSourceHash(project, thematicMapType, thematicMap),
    [project, thematicMapType, thematicMap]
  );
  const lastAnalysisTimestamp = getCachedAnalysisTimestamp(project);
  const mode = useSelectionStore((state) => state.mode);
  const selection = useSelectionStore((state) => state.selection);
  const draftCoordinates = useSelectionStore((state) => state.draftCoordinates);
  const setDraftCoordinates = useSelectionStore((state) => state.setDraftCoordinates);
  const commitRectangle = useSelectionStore((state) => state.commitRectangle);
  const setViewport = useMapStore((state) => state.setViewport);
  const setCursorCoordinates = useMapStore((state) => state.setCursorCoordinates);
  const setScaleLabel = useMapStore((state) => state.setScaleLabel);
  const measurementMode = useMapStore((state) => state.measurementMode);
  const addMeasurementPoint = useMapStore((state) => state.addMeasurementPoint);
  const setSelectedObject = useMapStore((state) => state.setSelectedObject);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: cartographicStyleEngine.createBlankMapLibreStyle(displaySettings.cartographicTheme),
      center: displaySettings.mapCenter,
      zoom: displaySettings.mapZoom,
    });

    mapRef.current = map;
    (window as unknown as { __formiqMap?: MapLibreMap }).__formiqMap = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const syncViewportState = () => {
      const center = map.getCenter();
      const zoom = Number(map.getZoom().toFixed(2));
      const viewportCenter: [number, number] = [
        Number(center.lng.toFixed(6)),
        Number(center.lat.toFixed(6)),
      ];

      setViewport({
        center: viewportCenter,
        zoom,
      });
      setScaleLabel(formatScaleLabel(center.lat, zoom));
    };

    const handlePointerMove = (event: MapMouseEvent) => {
      setCursorCoordinates({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      });
    };

    const handlePointerLeave = () => {
      setCursorCoordinates(null);
    };

    const handleMapLoad = () => {
      isMapStyleReadyRef.current = true;
      syncViewportState();
    };

    map.on("load", handleMapLoad);
    map.on("moveend", syncViewportState);
    map.on("mousemove", handlePointerMove);
    map.on("mouseleave", handlePointerLeave);

    return () => {
      map.off("load", handleMapLoad);
      map.off("moveend", syncViewportState);
      map.off("mousemove", handlePointerMove);
      map.off("mouseleave", handlePointerLeave);
      map.remove();
      delete (window as unknown as { __formiqMap?: MapLibreMap }).__formiqMap;
      mapRef.current = null;
      isMapStyleReadyRef.current = false;
    };
  }, [displaySettings.cartographicTheme, displaySettings.mapCenter, displaySettings.mapZoom, setCursorCoordinates, setScaleLabel, setViewport]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const theme = cartographicStyleEngine.getTheme(displaySettings.cartographicTheme);

    if (map.getLayer("formiq-background")) {
      map.setPaintProperty("formiq-background", "background-color", theme.colors.canvas);
    }

    if (map.getLayer("formiq-basemap")) {
      map.setPaintProperty(
        "formiq-basemap",
        "raster-opacity",
        displaySettings.cartographicTheme === "print"
          ? 0.72
          : displaySettings.cartographicTheme === "blueprint"
            ? 0.38
            : 0.9
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-saturation",
        displaySettings.cartographicTheme === "blueprint" ? -1 : -0.15
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-contrast",
        displaySettings.cartographicTheme === "dark" ? 0.08 : 0
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-brightness-min",
        displaySettings.cartographicTheme === "dark" ? 0.18 : 0
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-brightness-max",
        displaySettings.cartographicTheme === "dark" ? 0.92 : 1
      );
    }
  }, [displaySettings.cartographicTheme]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const center = map.getCenter();
    const currentCenter: [number, number] = [center.lng, center.lat];
    const currentZoom = map.getZoom();

    if (
      areCoordinatesClose(currentCenter, displaySettings.mapCenter) &&
      Math.abs(currentZoom - displaySettings.mapZoom) < 0.01
    ) {
      return;
    }

    map.jumpTo({
      center: displaySettings.mapCenter,
      zoom: displaySettings.mapZoom,
    });
  }, [displaySettings.mapCenter, displaySettings.mapZoom]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    map.easeTo({
      pitch: displaySettings.workspaceMode === "3d" ? 60 : 0,
      bearing: 0,
      duration: 500,
    });
  }, [displaySettings.workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const suppressedCategories = getSuppressedBaseCategories(
      thematicMapType,
      displaySettings.workspaceMode
    );

    const syncLayers = () => {
      const style = cartographicStyleEngine.compile({
        themeId: displaySettings.cartographicTheme,
        roadWidthMode: displaySettings.roadWidthMode,
        customRoadWidthMultiplier: displaySettings.customRoadWidthMultiplier,
        showRoadCasings: displaySettings.showRoadCasings,
      });

      const nextLayerIds = new Set(layers.map((layer) => layer.id));

      renderedLayerIdsRef.current.forEach((layerId) => {
        if (!nextLayerIds.has(layerId)) {
          removeGISLayer(map, layerId);
          renderedLayerIdsRef.current.delete(layerId);
        }
      });

      layers.forEach((layer) => {
        syncGISLayer(map, layer, style, suppressedCategories);
        renderedLayerIdsRef.current.add(layer.id);
      });
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncLayers();
      return;
    }

    map.once("load", syncLayers);
  }, [layers, displaySettings, thematicMapType]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const syncSelection = () => {
      syncSelectionLayer(
        map,
        selection,
        draftCoordinates,
        displaySettings.cartographicTheme,
        thematicMapType !== "none"
      );
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncSelection();
      return;
    }

    map.once("load", syncSelection);
  }, [selection, draftCoordinates, displaySettings.cartographicTheme, thematicMapType]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const syncTheme = () => {
      const previousThematicMapType = thematicLayerTypeRef.current;

      thematicLayerTypeRef.current = thematicMapType;
      syncThematicLayer(
        map,
        thematicMap,
        thematicSourceHash,
        displaySettings.analysisLayerOpacity,
        previousThematicMapType !== thematicMapType
      );
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncTheme();
      return;
    }

    map.once("load", syncTheme);
  }, [thematicMap, thematicMapType, thematicSourceHash, displaySettings.analysisLayerOpacity]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    map.getCanvas().style.cursor = mode === "none" ? "" : "crosshair";

    if (mode === "polygon") {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    const handleMouseDown = (event: MapMouseEvent) => {
      if (mode !== "rectangle") return;

      event.preventDefault();
      map.dragPan.disable();

      const start: Position = [event.lngLat.lng, event.lngLat.lat];
      rectangleStartRef.current = start;
      setDraftCoordinates(createRectangleCoordinates(start, start));
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      if (mode !== "rectangle" || !rectangleStartRef.current) return;

      const end: Position = [event.lngLat.lng, event.lngLat.lat];
      setDraftCoordinates(createRectangleCoordinates(rectangleStartRef.current, end));
    };

    const handleMouseUp = (event: MapMouseEvent) => {
      if (mode !== "rectangle" || !rectangleStartRef.current) return;

      const end: Position = [event.lngLat.lng, event.lngLat.lat];
      const rectangleCoordinates = createRectangleCoordinates(rectangleStartRef.current, end);

      rectangleStartRef.current = null;
      map.dragPan.enable();
      commitRectangle(rectangleCoordinates);
    };

    const handleClick = (event: MapMouseEvent) => {
      if (measurementMode !== "none") {
        addMeasurementPoint([event.lngLat.lng, event.lngLat.lat]);
        return;
      }

      if (mode !== "polygon") return;

      const nextPoint: Position = [event.lngLat.lng, event.lngLat.lat];
      setDraftCoordinates([...useSelectionStore.getState().draftCoordinates, nextPoint]);
    };

    const handleObjectSelection = (event: MapMouseEvent) => {
      if (mode !== "none" || measurementMode !== "none") {
        return;
      }

      setSelectedObject(resolveSelectedObject(map, event, project));
    };

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("click", handleClick);
    map.on("click", handleObjectSelection);

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("click", handleClick);
      map.off("click", handleObjectSelection);
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [addMeasurementPoint, commitRectangle, measurementMode, mode, project, setDraftCoordinates, setSelectedObject]);

  return (
    <>
      <div
        ref={mapContainer}
        className="h-full w-full rounded-3xl overflow-hidden"
      />
      <ThematicDebugOverlay
        activeTheme={thematicMapType}
        datasetFeatureCount={thematicMap?.geojson.features.length ?? 0}
        lastAnalysisTimestamp={lastAnalysisTimestamp ?? project.metadata.updatedAt}
        sourceHash={thematicSourceHash}
      />
    </>
  );
}

function syncGISLayer(
  map: MapLibreMap,
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>,
  suppressedCategories: Set<GISLayer["category"]>
): void {
  if (!layer.data) {
    return;
  }

  const data = resolveLayerFeatureCollection(layer.data);
  const sourceId = getSourceId(layer.id);
  const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;

  if (existingSource) {
    existingSource.setData(data);
  } else {
    map.addSource(sourceId, {
      type: "geojson",
      data,
    });
  }

  if (layer.geometryType === "line") {
    syncLineLayer(map, sourceId, layer, style, suppressedCategories.has(layer.category));
    return;
  }

  if (layer.geometryType === "point") {
    syncPointLayer(map, sourceId, layer, suppressedCategories.has(layer.category));
    return;
  }

  syncFillLayer(map, sourceId, layer, style, suppressedCategories.has(layer.category));
}

function resolveLayerFeatureCollection(
  data: NonNullable<GISLayer["data"]>
): FeatureCollection<Geometry, GeoJsonProperties> {
  if (isFeatureCollection(data)) {
    return data;
  }

  return formiqLayerDataToFeatureCollection(data);
}

function isFeatureCollection(
  data: NonNullable<GISLayer["data"]>
): data is FeatureCollection<Geometry, GeoJsonProperties> {
  return "type" in data && data.type === "FeatureCollection";
}

function removeGISLayer(map: MapLibreMap, layerId: string): void {
  const sourceId = getSourceId(layerId);
  const suffixes = ["fill", "stroke", "casing", "line", "point"];

  suffixes.forEach((suffix) => {
    const mapLayerId = `${sourceId}-${suffix}`;
    if (map.getLayer(mapLayerId)) {
      map.removeLayer(mapLayerId);
    }
  });

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function syncSelectionLayer(
  map: MapLibreMap,
  selection: ReturnType<typeof useSelectionStore.getState>["selection"],
  draftCoordinates: Position[],
  themeId: CartographicThemeId,
  softenFill: boolean
): void {
  const selectionPaint = cartographicStyleEngine.getSelectionPaint(themeId);
  const data = createSelectionFeatureCollection(selection, draftCoordinates);
  const existingSource = map.getSource(SELECTION_SOURCE_ID) as GeoJSONSource | undefined;

  if (existingSource) {
    existingSource.setData(data);
  } else {
    map.addSource(SELECTION_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  if (!map.getLayer(SELECTION_FILL_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_FILL_LAYER_ID,
      type: "fill",
      source: SELECTION_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: selectionPaint.fill,
    });
  }

  if (!map.getLayer(SELECTION_LINE_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_LINE_LAYER_ID,
      type: "line",
      source: SELECTION_SOURCE_ID,
      paint: selectionPaint.line,
    });
  }

  if (!map.getLayer(SELECTION_POINT_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_POINT_LAYER_ID,
      type: "circle",
      source: SELECTION_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: selectionPaint.point,
    });
  }

  map.setPaintProperty(SELECTION_FILL_LAYER_ID, "fill-color", selectionPaint.fill["fill-color"]);
  map.setPaintProperty(SELECTION_FILL_LAYER_ID, "fill-opacity", softenFill ? 0.05 : 0.16);
  map.setPaintProperty(SELECTION_LINE_LAYER_ID, "line-color", selectionPaint.line["line-color"]);
  map.setPaintProperty(SELECTION_POINT_LAYER_ID, "circle-color", selectionPaint.point["circle-color"]);
}

function syncThematicLayer(
  map: MapLibreMap,
  thematicMap: ThematicMapDefinition | null,
  sourceHash: string,
  analysisLayerOpacity: number,
  forceRecreate = false
): void {
  if (!thematicMap) {
    removeThematicLayer(map);
    return;
  }

  void forceRecreate;

  const renderData = createRenderableThematicGeoJson(thematicMap, sourceHash);
  const existingSource = map.getSource(THEMATIC_SOURCE_ID) as GeoJSONSource | undefined;

  if (existingSource) {
    existingSource.setData(renderData);
  } else {
    map.addSource(THEMATIC_SOURCE_ID, {
      type: "geojson",
      data: renderData,
    });
  }

  if (!map.getLayer(THEMATIC_FILL_LAYER_ID)) {
    map.addLayer({
      id: THEMATIC_FILL_LAYER_ID,
      type: "fill",
      source: THEMATIC_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": ["coalesce", ["get", thematicMap.style.fillColorProperty], "#229ED9"],
        "fill-opacity": thematicMap.style.fillOpacity * analysisLayerOpacity,
      },
    });
  }

  if (!map.getLayer(THEMATIC_LINE_LAYER_ID)) {
    map.addLayer({
      id: THEMATIC_LINE_LAYER_ID,
      type: "line",
      source: THEMATIC_SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", thematicMap.style.lineColorProperty], "#1D8CC2"],
        "line-width": thematicMap.style.lineWidth,
        "line-opacity": thematicMap.style.lineOpacity,
      },
    });
  }

  if (!map.getLayer(THEMATIC_POINT_LAYER_ID)) {
    map.addLayer({
      id: THEMATIC_POINT_LAYER_ID,
      type: "circle",
      source: THEMATIC_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ["coalesce", ["get", "renderColor"], "#F97316"],
        "circle-radius": 5,
        "circle-opacity": Math.min(0.95, thematicMap.style.fillOpacity * analysisLayerOpacity),
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1.5,
      },
    });
  }

  map.setPaintProperty(THEMATIC_FILL_LAYER_ID, "fill-color", [
    "coalesce",
    ["get", thematicMap.style.fillColorProperty],
    "#229ED9",
  ]);
  map.setPaintProperty(THEMATIC_FILL_LAYER_ID, "fill-opacity", thematicMap.style.fillOpacity * analysisLayerOpacity);
  map.setPaintProperty(THEMATIC_LINE_LAYER_ID, "line-color", [
    "coalesce",
    ["get", thematicMap.style.lineColorProperty],
    "#1D8CC2",
  ]);
  map.setPaintProperty(THEMATIC_LINE_LAYER_ID, "line-width", thematicMap.style.lineWidth);
  map.setPaintProperty(THEMATIC_LINE_LAYER_ID, "line-opacity", thematicMap.style.lineOpacity);
  map.setPaintProperty(THEMATIC_POINT_LAYER_ID, "circle-color", [
    "coalesce",
    ["get", "renderColor"],
    "#F97316",
  ]);
  map.setPaintProperty(
    THEMATIC_POINT_LAYER_ID,
    "circle-opacity",
    Math.min(0.95, thematicMap.style.fillOpacity * analysisLayerOpacity)
  );

  setLayerVisibility(map, THEMATIC_FILL_LAYER_ID, true);
  setLayerVisibility(map, THEMATIC_LINE_LAYER_ID, true);
  setLayerVisibility(map, THEMATIC_POINT_LAYER_ID, true);
  map.triggerRepaint();
}

function removeThematicLayer(map: MapLibreMap): void {
  [THEMATIC_FILL_LAYER_ID, THEMATIC_LINE_LAYER_ID, THEMATIC_POINT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  if (map.getSource(THEMATIC_SOURCE_ID)) {
    map.removeSource(THEMATIC_SOURCE_ID);
  }
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean): void {
  if (!map.getLayer(layerId)) {
    return;
  }

  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function getCachedThematicMap(
  project: FormiqProjectData,
  thematicMapType: string
): ThematicMapDefinition | null {
  if (thematicMapType === "none") {
    return null;
  }

  const cachedMap = project.thematicMaps[thematicMapType];

  return isThematicMapDefinition(cachedMap) ? cachedMap : null;
}

function createRenderableThematicGeoJson(
  thematicMap: ThematicMapDefinition,
  sourceHash: string
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    ...thematicMap.geojson,
    features: thematicMap.geojson.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        sourceHash,
      },
    })),
  };
}

function getThematicSourceHash(
  project: FormiqProjectData,
  thematicMapType: string,
  thematicMap: ThematicMapDefinition | null
): string {
  const featureCount = thematicMap?.geojson.features.length ?? 0;
  const firstFeatureId = thematicMap?.geojson.features[0]?.id ?? "none";
  const lastFeatureId = thematicMap?.geojson.features.at(-1)?.id ?? "none";

  return [
    project.id,
    project.activeTerritoryId ?? "no-territory",
    project.fusion?.fusedAt ?? "no-fusion",
    getCachedAnalysisTimestamp(project) ?? project.metadata.updatedAt,
    thematicMapType,
    featureCount,
    firstFeatureId,
    lastFeatureId,
  ].join("|");
}

function ThematicDebugOverlay({
  activeTheme,
  datasetFeatureCount,
  lastAnalysisTimestamp,
  sourceHash,
}: {
  activeTheme: string;
  datasetFeatureCount: number;
  lastAnalysisTimestamp: string;
  sourceHash: string;
}) {
  return (
    <aside
      data-testid="thematic-debug-overlay"
      className="pointer-events-none absolute bottom-6 right-6 z-30 w-72 rounded-xl border border-[#CBD5E1] bg-white/92 p-3 text-[11px] text-[#334155] shadow-lg backdrop-blur"
    >
      <div className="font-bold text-[#111827]">Theme Debug</div>
      <DebugMetric label="activeTheme" value={activeTheme} />
      <DebugMetric label="datasetFeatureCount" value={datasetFeatureCount.toLocaleString("ru-RU")} />
      <DebugMetric label="lastAnalysisTimestamp" value={lastAnalysisTimestamp} />
      <DebugMetric label="sourceHash" value={compactHash(sourceHash)} />
    </aside>
  );
}

function DebugMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex items-start justify-between gap-2">
      <span className="shrink-0 text-[#64748B]">{label}</span>
      <span className="min-w-0 truncate font-semibold text-[#0F172A]" title={value}>
        {value}
      </span>
    </div>
  );
}

function compactHash(value: string): string {
  if (value.length <= 36) {
    return value;
  }

  return `${value.slice(0, 16)}...${value.slice(-16)}`;
}

function syncFillLayer(
  map: MapLibreMap,
  sourceId: string,
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>,
  suppressed: boolean
): void {
  const fillLayerId = `${sourceId}-fill`;
  const strokeLayerId = `${sourceId}-stroke`;
  const visibility = layer.visible && !suppressed ? "visible" : "none";
  const fillPaint = resolveFillPaint(layer, style);
  const strokePaint = resolveStrokePaint(layer, style);

  if (!map.getLayer(fillLayerId)) {
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: fillPaint,
    });
  }

  if (!map.getLayer(strokeLayerId)) {
    map.addLayer({
      id: strokeLayerId,
      type: "line",
      source: sourceId,
      paint: strokePaint,
    });
  }

  Object.entries(fillPaint).forEach(([property, value]) => {
    map.setPaintProperty(fillLayerId, property, value);
  });
  Object.entries(strokePaint).forEach(([property, value]) => {
    map.setPaintProperty(strokeLayerId, property, value);
  });
  map.setPaintProperty(fillLayerId, "fill-opacity", layer.opacity);
  map.setPaintProperty(strokeLayerId, "line-opacity", layer.opacity);
  map.setLayoutProperty(fillLayerId, "visibility", visibility);
  map.setLayoutProperty(strokeLayerId, "visibility", visibility);
}

function syncLineLayer(
  map: MapLibreMap,
  sourceId: string,
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>,
  suppressed: boolean
): void {
  const casingLayerId = `${sourceId}-casing`;
  const lineLayerId = `${sourceId}-line`;

  if (!map.getLayer(casingLayerId)) {
    map.addLayer({
      id: casingLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: style.roadCasing,
    });
  }

  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: style.roadLine,
    });
  }

  Object.entries(style.roadCasing).forEach(([property, value]) => {
    map.setPaintProperty(casingLayerId, property, value);
  });
  Object.entries(style.roadLine).forEach(([property, value]) => {
    map.setPaintProperty(lineLayerId, property, value);
  });
  map.setPaintProperty(casingLayerId, "line-opacity", Math.min(layer.opacity, 0.9));
  map.setPaintProperty(lineLayerId, "line-opacity", layer.opacity);
  map.setLayoutProperty(casingLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
  map.setLayoutProperty(lineLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
}

function syncPointLayer(
  map: MapLibreMap,
  sourceId: string,
  layer: GISLayer,
  suppressed: boolean
): void {
  const pointLayerId = `${sourceId}-point`;

  if (!map.getLayer(pointLayerId)) {
    map.addLayer({
      id: pointLayerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": layer.style.fillColor ?? "#F97316",
        "circle-radius": layer.category === "transit" ? 5.5 : 4.5,
        "circle-opacity": layer.style.opacity ?? 0.95,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1.5,
      },
    });
  }

  map.setPaintProperty(pointLayerId, "circle-color", layer.style.fillColor ?? "#F97316");
  map.setPaintProperty(pointLayerId, "circle-opacity", layer.opacity);
  map.setLayoutProperty(pointLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
}

function resolveFillPaint(
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>
): Record<string, unknown> {
  if (layer.category === "buildings") return style.buildingFill;
  if (layer.category === "green") return style.vegetationFill;
  if (layer.category === "water") return style.waterFill;

  return {
    "fill-color": layer.style.fillColor ?? "#229ED9",
    "fill-opacity": layer.opacity,
  };
}

function resolveStrokePaint(
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>
): Record<string, unknown> {
  if (layer.category === "buildings") return style.buildingStroke;

  return {
    "line-color": layer.style.lineColor ?? layer.style.fillColor ?? "#1D8CC2",
    "line-width": layer.style.lineWidth ?? 1,
    "line-opacity": layer.opacity,
  };
}

function getSourceId(layerId: string): string {
  return `formiq-${layerId}`;
}

function resolveSelectedObject(
  map: MapLibreMap,
  event: MapMouseEvent,
  project: FormiqProjectData
): SelectedMapObject | null {
  const feature = map
    .queryRenderedFeatures(event.point)
    .find((item) => typeof item.properties?.id === "string" || typeof item.properties?.id === "number");

  if (!feature) {
    return null;
  }

  const objectId = String(feature.properties?.id);
  const entity = findEntityById(project, objectId);

  if (!entity) {
    return {
      id: objectId,
      type: formatEntityTypeLabel(String(feature.properties?.type ?? "unknown")),
      category: formatCategoryLabel(String(feature.properties?.category ?? "unknown")),
      properties: toRecord(feature.properties),
    };
  }

  return {
    id: entity.id,
    type: formatEntityTypeLabel(entity.type),
    category: getEntityCategory(entity),
    properties: getEntityProperties(entity),
  };
}

function findEntityById(project: FormiqProjectData, objectId: string): FormiqEntity | null {
  return (
    project.buildings.find((entity) => entity.id === objectId) ??
    project.roads.find((entity) => entity.id === objectId) ??
    project.vegetation.find((entity) => entity.id === objectId) ??
    project.water.find((entity) => entity.id === objectId) ??
    project.terrain.find((entity) => entity.id === objectId) ??
    project.boundaries.find((entity) => entity.id === objectId) ??
    project.poi.find((entity) => entity.id === objectId) ??
    project.transitStops.find((entity) => entity.id === objectId) ??
    null
  );
}

function getEntityCategory(entity: FormiqEntity): string {
  if (entity.type === "building") {
    return formatCategoryLabel(entity.semantic.functionCategory);
  }

  if (entity.type === "road") {
    return formatCategoryLabel(entity.roadType);
  }

  if (entity.type === "vegetation") {
    return formatCategoryLabel(entity.semantic.landscapeCategory);
  }

  if (entity.type === "water") {
    return formatCategoryLabel(entity.semantic.waterType);
  }

  if (entity.type === "terrain") {
    return formatCategoryLabel(entity.semantic.slopeCategory);
  }

  if (entity.type === "boundary") {
    return entity.name ?? "Граница";
  }

  if (entity.type === "poi") {
    return formatCategoryLabel(entity.category);
  }

  if (entity.type === "transit-stop") {
    return formatCategoryLabel(entity.stopType ?? "Остановка");
  }

  return "unknown";
}

function getEntityProperties(entity: FormiqEntity): SelectedMapObject["properties"] {
  if (entity.type === "building") {
    return {
      levels: entity.levels,
      height: entity.height,
      usage: entity.usage,
      year: entity.year,
      source: entity.source,
      confidence: entity.confidence,
    };
  }

  if (entity.type === "road") {
    return {
      roadType: entity.roadType,
      lanes: entity.lanes,
      surface: entity.surface,
      length: Math.round(entity.length),
      source: entity.source,
    };
  }

  if (entity.type === "vegetation") {
    return {
      vegetationType: entity.vegetationType,
      area: Math.round(entity.area),
      source: entity.source,
    };
  }

  if (entity.type === "water") {
    return {
      waterType: entity.waterType,
      area: Math.round(entity.area),
      source: entity.source,
    };
  }

  if (entity.type === "boundary") {
    return {
      adminLevel: entity.adminLevel,
      name: entity.name,
      source: entity.source,
    };
  }

  if (entity.type === "poi") {
    return {
      category: entity.category,
      subtype: entity.subtype,
      name: entity.name,
      source: entity.source,
    };
  }

  if (entity.type === "transit-stop") {
    return {
      network: entity.network,
      stopType: entity.stopType,
      name: entity.name,
      source: entity.source,
    };
  }

  return {
    source: entity.source,
    confidence: entity.confidence,
  };
}

function toRecord(
  properties: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean | null> {
  if (!properties) {
    return {};
  }

  return Object.entries(properties).reduce<Record<string, string | number | boolean | null>>(
    (result, [key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        result[key] = value;
      }

      return result;
    },
    {}
  );
}

function areCoordinatesClose(left: [number, number], right: [number, number]): boolean {
  return Math.abs(left[0] - right[0]) < 0.000001 && Math.abs(left[1] - right[1]) < 0.000001;
}

function formatScaleLabel(latitude: number, zoom: number): string {
  const metersPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  const referenceDistance = normalizeDistance(metersPerPixel * 100);

  if (referenceDistance >= 1_000) {
    return `${(referenceDistance / 1_000).toFixed(referenceDistance >= 10_000 ? 0 : 1)} km`;
  }

  return `${Math.round(referenceDistance)} m`;
}

function normalizeDistance(distanceMeters: number): number {
  if (distanceMeters <= 0) {
    return 0;
  }

  const steps = [1, 2, 5];
  const magnitude = 10 ** Math.floor(Math.log10(distanceMeters));
  const normalized = distanceMeters / magnitude;
  const step = steps.find((candidate) => normalized <= candidate) ?? 10;

  return step * magnitude;
}

function formatEntityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    building: "Здание",
    road: "Дорога",
    vegetation: "Озеленение",
    water: "Вода",
    terrain: "Рельеф",
    boundary: "Граница",
    poi: "POI",
    "transit-stop": "Остановка",
    unknown: "Неизвестно",
  };

  return labels[type] ?? type;
}

function formatCategoryLabel(value: string): string {
  const labels: Record<string, string> = {
    residential: "Жилая",
    commercial: "Коммерческая",
    industrial: "Производственная",
    public: "Общественная",
    education: "Образование",
    healthcare: "Медицина",
    religious: "Религия",
    sports: "Спорт",
    mixed: "Смешанная",
    unknown: "Неизвестно",
    primary: "Основная",
    secondary: "Второстепенная",
    tertiary: "Третьего класса",
    service: "Сервисная",
    pedestrian: "Пешеходная",
    footway: "Тротуар",
    cycleway: "Велодорожка",
    motorway: "Магистраль",
    trunk: "Транзитная",
    residential_road: "Жилая улица",
    park: "Парк",
    forest: "Лес",
    grass: "Трава",
    garden: "Сад",
    recreation: "Рекреация",
    river: "Река",
    canal: "Канал",
    lake: "Озеро",
    pond: "Пруд",
    reservoir: "Водохранилище",
    water: "Вода",
    flat: "Ровный",
    gentle: "Пологий",
    moderate: "Умеренный",
    steep: "Крутой",
  };

  return labels[value] ?? value;
}

function getSuppressedBaseCategories(
  thematicMapType: string,
  workspaceMode: string
): Set<GISLayer["category"]> {
  if (workspaceMode === "analysis") {
    if (["floors", "age", "function", "density"].includes(thematicMapType)) {
      return new Set(["buildings", "roads", "green", "water"]);
    }

    if (thematicMapType === "roads") {
      return new Set(["buildings", "roads", "green", "water"]);
    }

    if (thematicMapType === "vegetation") {
      return new Set(["buildings", "roads", "water"]);
    }

    if (thematicMapType === "water") {
      return new Set(["buildings", "roads", "green"]);
    }

    return new Set(["buildings", "roads", "green", "water"]);
  }

  if (["floors", "age", "function", "density"].includes(thematicMapType)) {
    return new Set(["buildings"]);
  }

  if (thematicMapType === "roads") {
    return new Set(["roads"]);
  }

  if (thematicMapType === "vegetation") {
    return new Set(["green"]);
  }

  if (thematicMapType === "water") {
    return new Set(["water"]);
  }

  return new Set();
}
