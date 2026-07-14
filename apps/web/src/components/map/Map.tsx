"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";
import {
  createRectangleCoordinates,
  createSelectionFeatureCollection,
  getRectangleRotationAngle,
  rotateRectangleCoordinates,
  resizeRectangleCoordinates,
  toPolygonCoordinates,
  translateSelectionCoordinates,
  updatePolygonVertex,
} from "@/features/selection/selectionGeometry";
import {
  CartographicStyleEngine,
  formiqLayerDataToFeatureCollection,
  getCachedAnalysisTimestamp,
  isThematicMapDefinition,
  ThreeDThematicMapEngine,
  type ThreeDRenderableMap,
  type ThematicMapDefinition,
  type ThematicMapType,
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
  ProjectWorkspaceMode,
  TerrainSourceId,
} from "@/types/formiq";
import {
  createPMTilesPresentationSources,
  PMTilesViewportTileManager,
  type PMTilesPresentationStats,
} from "./pmtilesPresentation";

const SELECTION_SOURCE_ID = "formiq-selection";
const SELECTION_FILL_LAYER_ID = "formiq-selection-fill";
const SELECTION_LINE_LAYER_ID = "formiq-selection-line";
const SELECTION_POINT_LAYER_ID = "formiq-selection-point";
const THEMATIC_SOURCE_ID = "thematic";
const THEMATIC_FILL_LAYER_ID = "thematic-fill";
const THEMATIC_LINE_LAYER_ID = "thematic-line";
const THEMATIC_POINT_LAYER_ID = "thematic-point";
const THREE_D_BUILDINGS_SOURCE_ID = "formiq-3d-buildings";
const THREE_D_PRESENTATION_WASH_SOURCE_ID = "formiq-3d-presentation-wash";
const THREE_D_ZONES_SOURCE_ID = "formiq-3d-zones";
const THREE_D_ROUTES_SOURCE_ID = "formiq-3d-routes";
const THREE_D_POI_SOURCE_ID = "formiq-3d-poi";
const THREE_D_TERRAIN_SOURCE_ID = "formiq-3d-terrain";
const MAPLIBRE_TERRAIN_SOURCE_ID_PREFIX = "formiq-maplibre-terrain-dem";
const THREE_D_TERRITORY_BOUNDARY_SOURCE_ID = "formiq-3d-territory-boundary";
const THREE_D_BUILDINGS_LAYER_ID = "formiq-3d-buildings";
const THREE_D_PRESENTATION_WASH_LAYER_ID = "formiq-3d-presentation-wash";
const THREE_D_BUILDING_OUTLINE_LAYER_ID = "formiq-3d-building-outline";
const THREE_D_HEIGHT_LABELS_LAYER_ID = "formiq-3d-height-labels";
const THREE_D_ZONES_LAYER_ID = "formiq-3d-zones";
const THREE_D_ZONE_OUTLINE_LAYER_ID = "formiq-3d-zone-outline";
const THREE_D_ROUTES_LAYER_ID = "formiq-3d-routes";
const THREE_D_POI_LAYER_ID = "formiq-3d-poi";
const THREE_D_TERRAIN_LAYER_ID = "formiq-3d-terrain";
const THREE_D_TERRITORY_BOUNDARY_LAYER_ID = "formiq-3d-territory-boundary";
const cartographicStyleEngine = new CartographicStyleEngine();
const threeDThematicMapEngine = new ThreeDThematicMapEngine();

interface SelectionDragState {
  kind: "move" | "rotate" | "resize" | "vertex";
  startPointer: Position;
  initialCoordinates: Position[];
  handleId?: string;
  vertexIndex?: number;
}

interface MapProps {
  workspaceModeOverride?: ProjectWorkspaceMode;
  thematicMapTypeOverride?: ThematicMapType;
  thematicMapOverride?: ThematicMapDefinition | null;
  showNavigationControls?: boolean;
}

export default function Map({
  workspaceModeOverride,
  thematicMapTypeOverride,
  thematicMapOverride,
  showNavigationControls = true,
}: MapProps = {}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rectangleStartRef = useRef<Position | null>(null);
  const renderedLayerIdsRef = useRef<Set<string>>(new Set());
  const thematicLayerTypeRef = useRef<string>("none");
  const sourceDataHashesRef = useRef<globalThis.Map<string, string>>(new globalThis.Map());
  const pmTilesManagerRef = useRef(new PMTilesViewportTileManager());
  const isMapStyleReadyRef = useRef(false);
  const selectionDragRef = useRef<SelectionDragState | null>(null);
  const layers = useLayers((state) => state.layers);
  const pmTilesSources = useMapStore((state) => state.pmTilesSources);
  const project = useProjectStore((state) => state.project);
  const displaySettings = project.settings.display;
  const workspaceMode = workspaceModeOverride ?? displaySettings.workspaceMode;
  const thematicMapType = thematicMapTypeOverride ?? displaySettings.activeThematicMapType;
  const thematicMap = useMemo(
    () =>
      thematicMapOverride !== undefined
        ? thematicMapOverride
        : getCachedThematicMap(project, thematicMapType),
    [project, thematicMapOverride, thematicMapType]
  );
  const thematicSourceHash = useMemo(
    () => getThematicSourceHash(project, thematicMapType, thematicMap),
    [project, thematicMapType, thematicMap]
  );
  const threeDMap = useMemo(
    () => threeDThematicMapEngine.build(project),
    [project]
  );
  const showDebugOverlay =
    process.env.NEXT_PUBLIC_FORMIQ_DEBUG === "true" || project.settings.debug.enabled;
  const terrainDiagnostics = getTerrainDiagnostics(project, threeDMap, workspaceMode === "3d");
  const lastAnalysisTimestamp = getCachedAnalysisTimestamp(project);
  const mode = useSelectionStore((state) => state.mode);
  const selection = useSelectionStore((state) => state.selection);
  const draftCoordinates = useSelectionStore((state) => state.draftCoordinates);
  const setDraftCoordinates = useSelectionStore((state) => state.setDraftCoordinates);
  const commitRectangle = useSelectionStore((state) => state.commitRectangle);
  const setSelectionPreview = useSelectionStore((state) => state.setSelectionPreview);
  const commitSelectionUpdate = useSelectionStore((state) => state.commitSelectionUpdate);
  const setViewport = useMapStore((state) => state.setViewport);
  const setCursorCoordinates = useMapStore((state) => state.setCursorCoordinates);
  const setScaleLabel = useMapStore((state) => state.setScaleLabel);
  const measurementMode = useMapStore((state) => state.measurementMode);
  const addMeasurementPoint = useMapStore((state) => state.addMeasurementPoint);
  const setSelectedObject = useMapStore((state) => state.setSelectedObject);
  const [pmTilesStats, setPMTilesStats] = useState<PMTilesPresentationStats | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const sourceDataHashes = sourceDataHashesRef.current;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: cartographicStyleEngine.createBlankMapLibreStyle(displaySettings.cartographicTheme),
      center: displaySettings.mapCenter,
      zoom: displaySettings.mapZoom,
    });

    mapRef.current = map;
    (window as unknown as { __formiqMap?: MapLibreMap }).__formiqMap = map;
    if (showNavigationControls) {
      map.addControl(new maplibregl.NavigationControl(), "top-right");
    }

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
      sourceDataHashes.clear();
    };
  }, [displaySettings.cartographicTheme, displaySettings.mapCenter, displaySettings.mapZoom, setCursorCoordinates, setScaleLabel, setViewport, showNavigationControls]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const syncPMTiles = () => {
      if (!isMapStyleAvailable(map)) return;

      const presentationSources = createPMTilesPresentationSources(pmTilesSources, layers);
      if (presentationSources.length === 0) {
        pmTilesManagerRef.current.clear(map);
        setPMTilesStats(null);
        return;
      }

      const bounds = map.getBounds();
      void pmTilesManagerRef.current
        .update(map, presentationSources, {
          zoom: map.getZoom(),
          bbox: {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          },
          center: [map.getCenter().lng, map.getCenter().lat],
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        })
        .then(setPMTilesStats);
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncPMTiles();
    } else {
      map.once("load", syncPMTiles);
    }

    map.on("moveend", syncPMTiles);
    map.on("zoomend", syncPMTiles);
    map.on("rotateend", syncPMTiles);
    map.on("pitchend", syncPMTiles);

    return () => {
      map.off("moveend", syncPMTiles);
      map.off("zoomend", syncPMTiles);
      map.off("rotateend", syncPMTiles);
      map.off("pitchend", syncPMTiles);
    };
  }, [pmTilesSources, layers]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;
    if (!isMapStyleAvailable(map)) return;

    const theme = cartographicStyleEngine.getTheme(displaySettings.cartographicTheme);

    if (map.getLayer("formiq-background")) {
      map.setPaintProperty(
        "formiq-background",
        "background-color",
        workspaceMode === "3d" && project.settings.threeD.visualStyle === "presentation"
          ? "#FBFAF7"
          : theme.colors.canvas
      );
    }

    if (map.getLayer("formiq-basemap")) {
      const isPresentation3D =
        workspaceMode === "3d" && project.settings.threeD.visualStyle === "presentation";
      map.setPaintProperty(
        "formiq-basemap",
        "raster-opacity",
        isPresentation3D
          ? 0.18
          : displaySettings.cartographicTheme === "print"
          ? 0.72
          : displaySettings.cartographicTheme === "blueprint"
            ? 0.38
            : 0.9
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-saturation",
        isPresentation3D || displaySettings.cartographicTheme === "blueprint" ? -1 : -0.15
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-contrast",
        isPresentation3D ? -0.1 : displaySettings.cartographicTheme === "dark" ? 0.08 : 0
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-brightness-min",
        isPresentation3D ? 0.72 : displaySettings.cartographicTheme === "dark" ? 0.18 : 0
      );
      map.setPaintProperty(
        "formiq-basemap",
        "raster-brightness-max",
        isPresentation3D ? 1 : displaySettings.cartographicTheme === "dark" ? 0.92 : 1
      );
    }
  }, [displaySettings.cartographicTheme, project.settings.threeD.visualStyle, workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;
    if (!isMapStyleAvailable(map)) return;

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
    if (!isMapStyleAvailable(map)) return;

    map.easeTo({
      pitch: workspaceMode === "3d" ? 60 : 0,
      bearing: workspaceMode === "3d" ? -30 : 0,
      duration: 500,
    });
  }, [workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;
    if (!isMapStyleAvailable(map)) return;

    const suppressedCategories = getSuppressedBaseCategories(
      thematicMapType,
      workspaceMode
    );

    const syncLayers = () => {
      const style = cartographicStyleEngine.compile({
        themeId: displaySettings.cartographicTheme,
        roadWidthMode: displaySettings.roadWidthMode,
        customRoadWidthMultiplier: displaySettings.customRoadWidthMultiplier,
        showRoadCasings: displaySettings.showRoadCasings,
      });

      const renderableLayers = layers.filter((layer) => layer.sourceType !== "pmtiles");
      const nextLayerIds = new Set(renderableLayers.map((layer) => layer.id));

      renderedLayerIdsRef.current.forEach((layerId) => {
        if (!nextLayerIds.has(layerId)) {
          removeGISLayer(map, layerId);
          renderedLayerIdsRef.current.delete(layerId);
        }
      });

      renderableLayers.forEach((layer) => {
        syncGISLayer(map, layer, style, suppressedCategories, sourceDataHashesRef.current);
        renderedLayerIdsRef.current.add(layer.id);
      });
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncLayers();
      return;
    }

    map.once("load", syncLayers);
  }, [layers, displaySettings, thematicMapType, workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;
    if (!isMapStyleAvailable(map)) return;

    const syncSelection = () => {
      syncSelectionLayer(
        map,
        selection,
        draftCoordinates,
        displaySettings.cartographicTheme,
        thematicMapType !== "none",
        sourceDataHashesRef.current
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
        workspaceMode === "3d" ? null : thematicMap,
        thematicSourceHash,
        displaySettings.analysisLayerOpacity,
        previousThematicMapType !== thematicMapType,
        sourceDataHashesRef.current
      );
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      syncTheme();
      return;
    }

    map.once("load", syncTheme);
  }, [thematicMap, thematicMapType, thematicSourceHash, displaySettings.analysisLayerOpacity, workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const sync3D = () => {
      syncThreeDThematicMap(
        map,
        project,
        threeDMap,
        project.settings.threeD.zoneOpacity,
        workspaceMode === "3d",
        project.settings.threeD.visualStyle,
        sourceDataHashesRef.current
      );
    };

    if (isMapStyleReadyRef.current || map.isStyleLoaded()) {
      sync3D();
      const retryId = window.setTimeout(sync3D, 250);
      return () => window.clearTimeout(retryId);
    }

    map.once("load", sync3D);
  }, [
    threeDMap,
    project,
    project.settings.threeD.zoneOpacity,
    project.settings.threeD.visualStyle,
    workspaceMode,
  ]);

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

    const handleSelectionDragStart = (event: MapMouseEvent) => {
      if (mode !== "none" || measurementMode !== "none" || !selection) {
        return;
      }

      const action = resolveSelectionDragState(map, event, selection);

      if (!action) {
        return;
      }

      event.preventDefault();
      map.dragPan.disable();
      selectionDragRef.current = action;
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      if (mode === "rectangle" && rectangleStartRef.current) {
        const end: Position = [event.lngLat.lng, event.lngLat.lat];
        setDraftCoordinates(createRectangleCoordinates(rectangleStartRef.current, end));
        return;
      }

      if (!selectionDragRef.current || !selection) {
        return;
      }

      const nextPointer: Position = [event.lngLat.lng, event.lngLat.lat];
      const nextCoordinates = applySelectionDrag(selectionDragRef.current, nextPointer);

      if (!nextCoordinates) {
        return;
      }

      setSelectionPreview({
        ...selection,
        bounds: createBoundingBoxFromCoordinates(nextCoordinates),
        geometry: {
          ...selection.geometry,
          geometry: {
            ...selection.geometry.geometry,
            coordinates: [nextCoordinates],
          },
        },
      });
    };

    const handleMouseUp = (event: MapMouseEvent) => {
      if (mode === "rectangle" && rectangleStartRef.current) {
        const end: Position = [event.lngLat.lng, event.lngLat.lat];
        const rectangleCoordinates = createRectangleCoordinates(rectangleStartRef.current, end);

        rectangleStartRef.current = null;
        map.dragPan.enable();
        commitRectangle(rectangleCoordinates);
        return;
      }

      if (!selectionDragRef.current) {
        return;
      }

      selectionDragRef.current = null;
      map.dragPan.enable();
      commitSelectionUpdate();
    };

    const handleClick = (event: MapMouseEvent) => {
      if (measurementMode !== "none") {
        addMeasurementPoint(createTerrainAwarePosition(map, event.lngLat.lng, event.lngLat.lat));
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
    map.on("mousedown", handleSelectionDragStart);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("click", handleClick);
    map.on("click", handleObjectSelection);

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousedown", handleSelectionDragStart);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("click", handleClick);
      map.off("click", handleObjectSelection);
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [
    addMeasurementPoint,
    commitRectangle,
    commitSelectionUpdate,
    measurementMode,
    mode,
    project,
    selection,
    setDraftCoordinates,
    setSelectedObject,
    setSelectionPreview,
  ]);

  return (
    <>
      <div
        ref={mapContainer}
        className="h-full w-full overflow-hidden"
        data-terrain-enabled={terrainDiagnostics.enabled}
        data-terrain-source={terrainDiagnostics.source}
        data-terrain-requested-source={terrainDiagnostics.requestedSource}
        data-terrain-samples={terrainDiagnostics.sampleCount}
        data-terrain-exaggeration={terrainDiagnostics.exaggeration}
        data-terrain-uses-maplibre="true"
      />
      {showDebugOverlay ? (
        <ThematicDebugOverlay
          activeTheme={thematicMapType}
          datasetFeatureCount={thematicMap?.geojson.features.length ?? 0}
          lastAnalysisTimestamp={lastAnalysisTimestamp ?? project.metadata.updatedAt}
          sourceHash={thematicSourceHash}
          pmTilesStats={pmTilesStats}
        />
      ) : null}
    </>
  );
}

function syncGISLayer(
  map: MapLibreMap,
  layer: GISLayer,
  style: ReturnType<CartographicStyleEngine["compile"]>,
  suppressedCategories: Set<GISLayer["category"]>,
  sourceDataHashes: globalThis.Map<string, string>
): void {
  if (!layer.data) {
    return;
  }

  const data = resolveLayerFeatureCollection(layer.data);
  const sourceId = getSourceId(layer.id);
  syncGeoJsonSource(map, sourceId, data, sourceDataHashes);

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
  softenFill: boolean,
  sourceDataHashes: globalThis.Map<string, string>
): void {
  const selectionPaint = cartographicStyleEngine.getSelectionPaint(themeId);
  const data = createSelectionFeatureCollection(selection, draftCoordinates);
  syncGeoJsonSource(map, SELECTION_SOURCE_ID, data, sourceDataHashes);

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
      paint: {
        "circle-color": [
          "match",
          ["get", "handleKind"],
          "rotate",
          "#F97316",
          String(selectionPaint.point["circle-color"] ?? "#229ED9"),
        ],
        "circle-radius": [
          "match",
          ["get", "handleKind"],
          "corner",
          6,
          "edge",
          5,
          "rotate",
          5.5,
          "vertex",
          5,
          4,
        ],
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 2,
      },
    });
  }

  setPaintPropertyIfChanged(map, SELECTION_FILL_LAYER_ID, "fill-color", selectionPaint.fill["fill-color"]);
  setPaintPropertyIfChanged(map, SELECTION_FILL_LAYER_ID, "fill-opacity", softenFill ? 0.05 : 0.16);
  setPaintPropertyIfChanged(map, SELECTION_LINE_LAYER_ID, "line-color", selectionPaint.line["line-color"]);
  setPaintPropertyIfChanged(map, SELECTION_POINT_LAYER_ID, "circle-color", [
    "match",
    ["get", "handleKind"],
    "rotate",
    "#F97316",
    String(selectionPaint.point["circle-color"] ?? "#229ED9"),
  ]);
}

function syncThematicLayer(
  map: MapLibreMap,
  thematicMap: ThematicMapDefinition | null,
  sourceHash: string,
  analysisLayerOpacity: number,
  forceRecreate = false,
  sourceDataHashes: globalThis.Map<string, string>
): void {
  if (!thematicMap) {
    removeThematicLayer(map);
    return;
  }

  if (forceRecreate) {
    removeThematicLayer(map);
    sourceDataHashes.delete(THEMATIC_SOURCE_ID);
  }

  const renderData = createRenderableThematicGeoJson(thematicMap, sourceHash);
  syncGeoJsonSource(map, THEMATIC_SOURCE_ID, renderData, sourceDataHashes, sourceHash);

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

  setPaintPropertyIfChanged(map, THEMATIC_FILL_LAYER_ID, "fill-color", [
    "coalesce",
    ["get", thematicMap.style.fillColorProperty],
    "#229ED9",
  ]);
  setPaintPropertyIfChanged(
    map,
    THEMATIC_FILL_LAYER_ID,
    "fill-opacity",
    thematicMap.style.fillOpacity * analysisLayerOpacity
  );
  setPaintPropertyIfChanged(map, THEMATIC_LINE_LAYER_ID, "line-color", [
    "coalesce",
    ["get", thematicMap.style.lineColorProperty],
    "#1D8CC2",
  ]);
  setPaintPropertyIfChanged(map, THEMATIC_LINE_LAYER_ID, "line-width", thematicMap.style.lineWidth);
  setPaintPropertyIfChanged(map, THEMATIC_LINE_LAYER_ID, "line-opacity", thematicMap.style.lineOpacity);
  setPaintPropertyIfChanged(map, THEMATIC_POINT_LAYER_ID, "circle-color", [
    "coalesce",
    ["get", "renderColor"],
    "#F97316",
  ]);
  setPaintPropertyIfChanged(
    map,
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

function syncThreeDThematicMap(
  map: MapLibreMap,
  project: FormiqProjectData,
  threeDMap: ThreeDRenderableMap,
  zoneOpacity: number,
  visible: boolean,
  visualStyle: "gis" | "presentation",
  sourceDataHashes: globalThis.Map<string, string>
): void {
  const presentation = visualStyle === "presentation";
  syncMapLibreTerrain(map, project, visible);

  if (map.getLayer("formiq-basemap")) {
    setPaintPropertyIfChanged(map, "formiq-basemap", "raster-opacity", presentation && visible ? 0.18 : 0.9);
    setPaintPropertyIfChanged(map, "formiq-basemap", "raster-saturation", presentation && visible ? -1 : -0.15);
    setPaintPropertyIfChanged(map, "formiq-basemap", "raster-contrast", presentation && visible ? -0.1 : 0);
    setPaintPropertyIfChanged(map, "formiq-basemap", "raster-brightness-min", presentation && visible ? 0.72 : 0);
    setPaintPropertyIfChanged(map, "formiq-basemap", "raster-brightness-max", 1);
  }

  syncGeoJsonSource(map, THREE_D_PRESENTATION_WASH_SOURCE_ID, createPresentationWashGeoJson(), sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_BUILDINGS_SOURCE_ID, threeDMap.buildings, sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_ZONES_SOURCE_ID, threeDMap.zones, sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_ROUTES_SOURCE_ID, threeDMap.routes, sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_POI_SOURCE_ID, threeDMap.poi, sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_TERRAIN_SOURCE_ID, threeDMap.terrain, sourceDataHashes);
  syncGeoJsonSource(map, THREE_D_TERRITORY_BOUNDARY_SOURCE_ID, threeDMap.territoryBoundary, sourceDataHashes);

  if (!map.getLayer(THREE_D_PRESENTATION_WASH_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_PRESENTATION_WASH_LAYER_ID,
      type: "fill",
      source: THREE_D_PRESENTATION_WASH_SOURCE_ID,
      paint: {
        "fill-color": "#FFFFFF",
        "fill-opacity": 0.58,
      },
    });
  }

  if (!map.getLayer(THREE_D_ZONES_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_ZONES_LAYER_ID,
      type: "fill",
      source: THREE_D_ZONES_SOURCE_ID,
      paint: {
        "fill-color": ["coalesce", ["get", "renderColor"], "#86EFAC"],
        "fill-opacity": zoneOpacity,
      },
    });
  }

  if (!map.getLayer(THREE_D_ZONE_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_ZONE_OUTLINE_LAYER_ID,
      type: "line",
      source: THREE_D_ZONES_SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", "outlineColor"], "#22C55E"],
        "line-width": 0.8,
        "line-opacity": 0.72,
      },
    });
  }

  if (!map.getLayer(THREE_D_ROUTES_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_ROUTES_LAYER_ID,
      type: "line",
      source: THREE_D_ROUTES_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", "renderColor"], "#2563EB"],
        "line-width": ["coalesce", ["get", "routeWidth"], 4],
        "line-opacity": presentation ? 0.78 : 0.92,
      },
    });
  }

  if (!map.getLayer(THREE_D_TERRITORY_BOUNDARY_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_TERRITORY_BOUNDARY_LAYER_ID,
      type: "line",
      source: THREE_D_TERRITORY_BOUNDARY_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": presentation ? "#3F3A35" : "#374151",
        "line-width": presentation ? 1.4 : 1.2,
        "line-opacity": presentation ? 0.86 : 0.78,
        "line-dasharray": [2, 1.2],
      },
    });
  }

  if (!map.getLayer(THREE_D_BUILDINGS_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_BUILDINGS_LAYER_ID,
      type: "fill-extrusion",
      source: THREE_D_BUILDINGS_SOURCE_ID,
      paint: {
        "fill-extrusion-color": ["coalesce", ["get", "renderColor"], "#F8FAFC"],
        "fill-extrusion-height": ["coalesce", ["get", "renderHeight"], 8],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": presentation ? 0.94 : 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }

  if (!map.getLayer(THREE_D_BUILDING_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_BUILDING_OUTLINE_LAYER_ID,
      type: "line",
      source: THREE_D_BUILDINGS_SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", "outlineColor"], "#94A3B8"],
        "line-width": presentation ? 0.55 : 0.45,
        "line-opacity": presentation ? 0.62 : 0.75,
      },
    });
  }

  if (!map.getLayer(THREE_D_HEIGHT_LABELS_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_HEIGHT_LABELS_LAYER_ID,
      type: "symbol",
      source: THREE_D_BUILDINGS_SOURCE_ID,
      layout: {
        "text-field": ["get", "heightLabel"],
        "text-size": presentation ? 10 : 11,
        "text-anchor": "center",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": presentation ? "#64748B" : "#334155",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.2,
      },
    });
  }

  if (!map.getLayer(THREE_D_TERRAIN_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_TERRAIN_LAYER_ID,
      type: "circle",
      source: THREE_D_TERRAIN_SOURCE_ID,
      paint: {
        "circle-color": ["coalesce", ["get", "renderColor"], "#A7F3D0"],
        "circle-radius": presentation ? 2.4 : 3,
        "circle-opacity": presentation ? 0.5 : 0.72,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1,
      },
    });
  }

  if (!map.getLayer(THREE_D_POI_LAYER_ID)) {
    map.addLayer({
      id: THREE_D_POI_LAYER_ID,
      type: "symbol",
      source: THREE_D_POI_SOURCE_ID,
      layout: {
        "text-field": ["case", ["boolean", ["get", "callout"], false], ["get", "label"], "●"],
        "text-size": ["case", ["boolean", ["get", "callout"], false], presentation ? 10 : 11, presentation ? 13 : 18],
        "text-anchor": ["case", ["boolean", ["get", "callout"], false], "bottom", "center"],
        "text-offset": ["case", ["boolean", ["get", "callout"], false], ["literal", [0, -0.8]], ["literal", [0, 0]]],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["coalesce", ["get", "renderColor"], "#F97316"],
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.2,
      },
    });
  }

  setPaintPropertyIfChanged(map, THREE_D_PRESENTATION_WASH_LAYER_ID, "fill-opacity", presentation ? 0.58 : 0);
  setPaintPropertyIfChanged(map, THREE_D_ZONES_LAYER_ID, "fill-color", ["coalesce", ["get", "renderColor"], "#86EFAC"]);
  setPaintPropertyIfChanged(map, THREE_D_ZONES_LAYER_ID, "fill-opacity", presentation ? Math.min(zoneOpacity, 0.34) : zoneOpacity);
  setPaintPropertyIfChanged(map, THREE_D_TERRITORY_BOUNDARY_LAYER_ID, "line-color", presentation ? "#3F3A35" : "#374151");
  setPaintPropertyIfChanged(map, THREE_D_TERRITORY_BOUNDARY_LAYER_ID, "line-opacity", presentation ? 0.86 : 0.78);
  setPaintPropertyIfChanged(map, THREE_D_ROUTES_LAYER_ID, "line-color", ["coalesce", ["get", "renderColor"], "#2563EB"]);
  setPaintPropertyIfChanged(map, THREE_D_ROUTES_LAYER_ID, "line-width", ["coalesce", ["get", "routeWidth"], 4]);
  setPaintPropertyIfChanged(map, THREE_D_ROUTES_LAYER_ID, "line-opacity", presentation ? 0.78 : 0.92);
  setPaintPropertyIfChanged(map, THREE_D_BUILDINGS_LAYER_ID, "fill-extrusion-color", ["coalesce", ["get", "renderColor"], "#F8FAFC"]);
  setPaintPropertyIfChanged(map, THREE_D_BUILDINGS_LAYER_ID, "fill-extrusion-height", ["coalesce", ["get", "renderHeight"], 8]);
  setPaintPropertyIfChanged(map, THREE_D_BUILDINGS_LAYER_ID, "fill-extrusion-base", 0);
  setPaintPropertyIfChanged(map, THREE_D_BUILDINGS_LAYER_ID, "fill-extrusion-opacity", presentation ? 0.94 : 0.92);
  setLayoutPropertyIfChanged(map, THREE_D_HEIGHT_LABELS_LAYER_ID, "text-size", presentation ? 10 : 11);
  setPaintPropertyIfChanged(map, THREE_D_HEIGHT_LABELS_LAYER_ID, "text-color", presentation ? "#64748B" : "#334155");
  setLayoutPropertyIfChanged(map, THREE_D_POI_LAYER_ID, "text-size", [
    "case",
    ["boolean", ["get", "callout"], false],
    presentation ? 10 : 11,
    presentation ? 13 : 18,
  ]);

  [
    THREE_D_PRESENTATION_WASH_LAYER_ID,
    THREE_D_ZONES_LAYER_ID,
    THREE_D_ZONE_OUTLINE_LAYER_ID,
    THREE_D_ROUTES_LAYER_ID,
    THREE_D_TERRITORY_BOUNDARY_LAYER_ID,
    THREE_D_BUILDINGS_LAYER_ID,
    THREE_D_BUILDING_OUTLINE_LAYER_ID,
    THREE_D_HEIGHT_LABELS_LAYER_ID,
    THREE_D_POI_LAYER_ID,
    THREE_D_TERRAIN_LAYER_ID,
  ].forEach((layerId) =>
    setLayerVisibility(
      map,
      layerId,
      visible &&
        (layerId !== THREE_D_PRESENTATION_WASH_LAYER_ID || presentation) &&
        (layerId !== THREE_D_HEIGHT_LABELS_LAYER_ID || project.settings.threeD.showHeights)
    )
  );

  map.triggerRepaint();
}

function syncMapLibreTerrain(
  map: MapLibreMap,
  project: FormiqProjectData,
  visible: boolean
): void {
  const terrainSettings = project.settings.threeD.terrain;
  const effectiveTerrainSource = getEffectiveTerrainSource(project, terrainSettings.source);
  const shouldEnableTerrain =
    visible &&
    project.settings.threeD.showTerrain &&
    terrainSettings.enabled &&
    effectiveTerrainSource !== "none";

  if (!shouldEnableTerrain) {
    try {
      map.setTerrain(null);
    } catch {
      // The map can reject terrain changes while its style is being rebuilt.
    }
    return;
  }

  const mapLibreTerrainSourceId = getMapLibreTerrainSourceId(effectiveTerrainSource);

  if (!map.getSource(mapLibreTerrainSourceId)) {
    map.addSource(mapLibreTerrainSourceId, {
      type: "raster-dem",
      tiles: [getTerrainRasterDemTileUrl(effectiveTerrainSource)],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 15,
      encoding: getTerrainRasterDemEncoding(),
    });
  }

  try {
    map.setTerrain({
      source: mapLibreTerrainSourceId,
      exaggeration: terrainSettings.exaggeration,
    });
  } catch {
    // Style/source updates can be temporarily unavailable during mode switches.
  }
}

function getMapLibreTerrainSourceId(source: TerrainSourceId): string {
  return `${MAPLIBRE_TERRAIN_SOURCE_ID_PREFIX}-${source}`;
}

function getTerrainDiagnostics(
  project: FormiqProjectData,
  threeDMap: ThreeDRenderableMap,
  isThreeDMode: boolean
) {
  const terrainSettings = project.settings.threeD.terrain;
  const effectiveTerrainSource = getEffectiveTerrainSource(project, terrainSettings.source);
  const enabled =
    isThreeDMode &&
    project.settings.threeD.showTerrain &&
    terrainSettings.enabled &&
    effectiveTerrainSource !== "none";

  return {
    enabled: String(enabled),
    source: effectiveTerrainSource,
    requestedSource: terrainSettings.source,
    sampleCount: String(threeDMap.terrainSummary?.sampleCount ?? 0),
    exaggeration: String(terrainSettings.exaggeration),
  };
}

function getEffectiveTerrainSource(
  project: FormiqProjectData,
  requestedSource: TerrainSourceId
): TerrainSourceId {
  if (!isOpenTopographyTerrainSource(requestedSource)) {
    return requestedSource;
  }

  const openTopographyState = project.fusion?.sourceStates.find(
    (state) => state.source === "copernicus-dem"
  );
  const isOpenTopographyUnavailable =
    openTopographyState?.status === "rate-limited" ||
    openTopographyState?.status === "offline" ||
    openTopographyState?.status === "error";

  if (isOpenTopographyUnavailable && process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
    return "mapbox-terrain-rgb";
  }

  return requestedSource;
}

function isOpenTopographyTerrainSource(source: TerrainSourceId): boolean {
  return source === "copernicus-dem" || source === "opentopography";
}

function getTerrainRasterDemTileUrl(source: TerrainSourceId): string {
  if (source === "mapbox-terrain-rgb") {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    return token
      ? `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${encodeURIComponent(token)}`
      : "/api/data/terrain-rgb/{z}/{x}/{y}?source=opentopography&demType=COP30";
  }

  if (source === "local-heightmap") {
    return "/api/data/terrain-rgb/{z}/{x}/{y}?source=local-heightmap";
  }

  return "/api/data/terrain-rgb/{z}/{x}/{y}?source=opentopography&demType=COP30";
}

function getTerrainRasterDemEncoding(): "mapbox" {
  return "mapbox";
}

function createTerrainAwarePosition(
  map: MapLibreMap,
  longitude: number,
  latitude: number
): Position {
  const elevation = getMapTerrainElevation(map, longitude, latitude);

  return typeof elevation === "number" ? [longitude, latitude, elevation] : [longitude, latitude];
}

function getMapTerrainElevation(
  map: MapLibreMap,
  longitude: number,
  latitude: number
): number | null {
  try {
    const candidate = map.queryTerrainElevation([longitude, latitude]);
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function createPresentationWashGeoJson(): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
        },
      },
    ],
  };
}

function syncGeoJsonSource(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection<Geometry, GeoJsonProperties>,
  sourceDataHashes: globalThis.Map<string, string>,
  dataHash = createGeoJsonSourceHash(data)
): void {
  const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;

  if (existingSource) {
    if (sourceDataHashes.get(sourceId) !== dataHash) {
      existingSource.setData(data);
      sourceDataHashes.set(sourceId, dataHash);
    }
    return;
  }

  map.addSource(sourceId, {
    type: "geojson",
    data,
    ...getGeoJsonSourcePerformanceOptions(data),
  });
  sourceDataHashes.set(sourceId, dataHash);
}

function isMapStyleAvailable(map: MapLibreMap): boolean {
  try {
    return Boolean(map.getStyle());
  } catch {
    return false;
  }
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean): void {
  if (!map.getLayer(layerId)) {
    return;
  }

  setLayoutPropertyIfChanged(map, layerId, "visibility", visible ? "visible" : "none");
}

function setPaintPropertyIfChanged(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown
): void {
  if (!map.getLayer(layerId)) {
    return;
  }

  if (areMapLibreValuesEqual(map.getPaintProperty(layerId, property), value)) {
    return;
  }

  map.setPaintProperty(layerId, property, value);
}

function setLayoutPropertyIfChanged(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown
): void {
  if (!map.getLayer(layerId)) {
    return;
  }

  if (areMapLibreValuesEqual(map.getLayoutProperty(layerId, property), value)) {
    return;
  }

  map.setLayoutProperty(layerId, property, value);
}

function areMapLibreValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }

  return JSON.stringify(left) === JSON.stringify(right);
}

function createGeoJsonSourceHash(data: FeatureCollection<Geometry, GeoJsonProperties>): string {
  return JSON.stringify(data);
}

function getGeoJsonSourcePerformanceOptions(
  data: FeatureCollection<Geometry, GeoJsonProperties>
): Record<string, unknown> {
  if (!isPointOnlyFeatureCollection(data)) {
    return {};
  }

  if (data.features.length >= 1000) {
    return {
      maxzoom: 14,
    };
  }

  return {
    maxzoom: 16,
  };
}

function isPointOnlyFeatureCollection(data: FeatureCollection<Geometry, GeoJsonProperties>): boolean {
  return data.features.length > 0 && data.features.every((feature) => feature.geometry.type === "Point");
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
  pmTilesStats,
}: {
  activeTheme: string;
  datasetFeatureCount: number;
  lastAnalysisTimestamp: string;
  sourceHash: string;
  pmTilesStats: PMTilesPresentationStats | null;
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
      {pmTilesStats ? (
        <>
          <div className="mt-3 border-t border-[#CBD5E1] pt-2 font-bold text-[#111827]">PMTiles</div>
          <DebugMetric label="Loaded Tiles" value={pmTilesStats.loadedTiles.toLocaleString("ru-RU")} />
          <DebugMetric label="Visible Tiles" value={pmTilesStats.visibleTiles.toLocaleString("ru-RU")} />
          <DebugMetric label="Cached Tiles" value={pmTilesStats.cachedTiles.toLocaleString("ru-RU")} />
          <DebugMetric label="Loading Tiles" value={pmTilesStats.loadingTiles.toLocaleString("ru-RU")} />
          <DebugMetric label="Decoded Features" value={pmTilesStats.decodedFeatures.toLocaleString("ru-RU")} />
          <DebugMetric label="Frame Time" value={`${pmTilesStats.frameTimeMs} ms`} />
          <DebugMetric label="FPS" value={pmTilesStats.fps.toLocaleString("ru-RU")} />
          <DebugMetric label="Memory" value={pmTilesStats.memoryMb === null ? "n/a" : `${pmTilesStats.memoryMb} MB`} />
        </>
      ) : null}
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
    setPaintPropertyIfChanged(map, fillLayerId, property, value);
  });
  Object.entries(strokePaint).forEach(([property, value]) => {
    setPaintPropertyIfChanged(map, strokeLayerId, property, value);
  });
  setPaintPropertyIfChanged(map, fillLayerId, "fill-opacity", layer.opacity);
  setPaintPropertyIfChanged(map, strokeLayerId, "line-opacity", layer.opacity);
  setLayoutPropertyIfChanged(map, fillLayerId, "visibility", visibility);
  setLayoutPropertyIfChanged(map, strokeLayerId, "visibility", visibility);
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
    setPaintPropertyIfChanged(map, casingLayerId, property, value);
  });
  Object.entries(style.roadLine).forEach(([property, value]) => {
    setPaintPropertyIfChanged(map, lineLayerId, property, value);
  });
  setPaintPropertyIfChanged(map, casingLayerId, "line-opacity", Math.min(layer.opacity, 0.9));
  setPaintPropertyIfChanged(map, lineLayerId, "line-opacity", layer.opacity);
  setLayoutPropertyIfChanged(map, casingLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
  setLayoutPropertyIfChanged(map, lineLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
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

  setPaintPropertyIfChanged(map, pointLayerId, "circle-color", layer.style.fillColor ?? "#F97316");
  setPaintPropertyIfChanged(map, pointLayerId, "circle-opacity", layer.opacity);
  setLayoutPropertyIfChanged(map, pointLayerId, "visibility", layer.visible && !suppressed ? "visible" : "none");
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

function resolveSelectionDragState(
  map: MapLibreMap,
  event: MapMouseEvent,
  selection: NonNullable<ReturnType<typeof useSelectionStore.getState>["selection"]>
): SelectionDragState | null {
  if (
    !map.getLayer(SELECTION_POINT_LAYER_ID) ||
    !map.getLayer(SELECTION_FILL_LAYER_ID) ||
    !map.getLayer(SELECTION_LINE_LAYER_ID)
  ) {
    return null;
  }

  const features = map.queryRenderedFeatures(event.point, {
    layers: [SELECTION_POINT_LAYER_ID, SELECTION_FILL_LAYER_ID, SELECTION_LINE_LAYER_ID],
  });
  const handleFeature = features.find(
    (feature) => feature.layer.id === SELECTION_POINT_LAYER_ID && feature.properties?.featureType === "selection-handle"
  );
  const pointer: Position = [event.lngLat.lng, event.lngLat.lat];
  const initialCoordinates = toPolygonCoordinates(selection);

  if (handleFeature) {
    const handleId = String(handleFeature.properties?.handleId ?? "");
    const handleKind = String(handleFeature.properties?.handleKind ?? "");
    const vertexIndex = toOptionalNumber(handleFeature.properties?.vertexIndex);

    if (selection.shape === "rectangle" && handleKind === "rotate") {
      return {
        kind: "rotate",
        startPointer: pointer,
        initialCoordinates,
      };
    }

    if (selection.shape === "rectangle") {
      return {
        kind: "resize",
        startPointer: pointer,
        initialCoordinates,
        handleId,
      };
    }

    if (handleKind === "vertex" && typeof vertexIndex === "number") {
      return {
        kind: "vertex",
        startPointer: pointer,
        initialCoordinates,
        vertexIndex,
      };
    }
  }

  const selectionFeature = features.find((feature) => feature.properties?.featureType === "selection");

  if (!selectionFeature) {
    return null;
  }

  return {
    kind: "move",
    startPointer: pointer,
    initialCoordinates,
  };
}

function applySelectionDrag(state: SelectionDragState, nextPointer: Position): Position[] | null {
  switch (state.kind) {
    case "move":
      return translateSelectionCoordinates(
        state.initialCoordinates,
        nextPointer[0] - state.startPointer[0],
        nextPointer[1] - state.startPointer[1]
      );
    case "rotate":
      return rotateRectangleCoordinates(
        state.initialCoordinates,
        getRectangleRotationAngle(state.initialCoordinates, state.startPointer, nextPointer)
      );
    case "resize":
      return state.handleId
        ? resizeRectangleCoordinates(state.initialCoordinates, state.handleId, nextPointer)
        : state.initialCoordinates;
    case "vertex":
      return typeof state.vertexIndex === "number"
        ? updatePolygonVertex(state.initialCoordinates, state.vertexIndex, nextPointer)
        : state.initialCoordinates;
    default:
      return null;
  }
}

function createBoundingBoxFromCoordinates(coordinates: Position[]) {
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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
    boundary: "Граница",
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
  if (workspaceMode === "3d") {
    return new Set(["buildings", "roads", "green", "water"]);
  }

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
