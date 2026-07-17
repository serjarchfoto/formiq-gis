"use client";

import { useCallback, useEffect, useMemo } from "react";
import { AnalysisEngine, ThematicMapEngine } from "@/lib";
import {
  analysisScenarios,
  buildAnalysisModel,
  getAnalysisScenario,
  projectScenario,
  type AnalysisScenarioId,
} from "@/features/analysis/model";
import {
  createAnalysisLegendViewModel,
  createAnalysisMetricViewModels,
  getAnalysisLayerDefinition,
  getReadyAnalysisLayers,
  normalizeAnalysisLayerId,
  type AnalysisLayerId,
} from "@/features/analysis/registry";
import { useAnalysisStore } from "@/store/analysis";
import { useMapStore } from "@/store/map";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { FormiqLayerData } from "@/types/formiq";
import { AnalysisLayerSelector } from "./AnalysisLayerSelector";
import { AnalysisMap } from "./AnalysisMap";
import { AnalysisMapControls } from "./AnalysisMapControls";
import { AnalysisMapToolbar } from "./AnalysisMapToolbar";
import { AnalysisStatusBar } from "./AnalysisStatusBar";
import { BottomMetrics } from "./BottomMetrics";
import { MapLegend } from "./MapLegend";
import { MapSelectionPopover } from "./MapSelectionPopover";
import { MetricPanel } from "./MetricPanel";
import { MobileAnalysisDock, type MobileAnalysisTab } from "./MobileAnalysisDock";
import { ScenarioPanel } from "./ScenarioPanel";

const analysisEngine = new AnalysisEngine();
const thematicMapEngine = new ThematicMapEngine();
const readyAnalysisLayers = getReadyAnalysisLayers();
const mobileTabs: MobileAnalysisTab[] = ["layers", "metrics", "scenarios", "legend"];

export default function AnalysisWorkspace() {
  const project = useProjectStore((state) => state.project);
  const activeTerritory = project.territories.find((territory) => territory.id === project.activeTerritoryId) ?? null;
  const hasActiveTerritory = Boolean(activeTerritory);
  const storedActiveLayerId = useUIStore((state) => state.activeAnalysisLayerId);
  const activeLayerId = normalizeAnalysisLayerId(storedActiveLayerId);
  const storedActiveScenarioId = useUIStore((state) => state.activeScenarioId);
  const storedCompareScenarioId = useUIStore((state) => state.compareScenarioId);
  const comparisonMode = useUIStore((state) => state.comparisonMode);
  const analysisViewMode = useUIStore((state) => state.analysisViewMode);
  const analysisLayerOpacity = useUIStore((state) => state.analysisLayerOpacity);
  const analysisPanels = useUIStore((state) => state.analysisPanels);
  const routePanel = useUIStore((state) => state.activePanelByRoute["/analysis"]);
  const setActiveLayerId = useUIStore((state) => state.setActiveAnalysisLayerId);
  const setActiveScenarioId = useUIStore((state) => state.setActiveScenarioId);
  const setCompareScenarioId = useUIStore((state) => state.setCompareScenarioId);
  const setComparisonMode = useUIStore((state) => state.setComparisonMode);
  const setAnalysisViewMode = useUIStore((state) => state.setAnalysisViewMode);
  const setAnalysisLayerOpacity = useUIStore((state) => state.setAnalysisLayerOpacity);
  const setAnalysisPanelCollapsed = useUIStore((state) => state.setAnalysisPanelCollapsed);
  const setRoutePanel = useUIStore((state) => state.setRoutePanel);
  const completeWorkflowStage = useUIStore((state) => state.completeWorkflowStage);
  const analysisStatus = useAnalysisStore((state) => state.status);
  const hydrateAnalysis = useAnalysisStore((state) => state.hydrate);
  const selectedObject = useMapStore((state) => state.selectedObject);
  const cursorCoordinates = useMapStore((state) => state.cursorCoordinates);
  const scaleLabel = useMapStore((state) => state.scaleLabel);
  const setSelectedObject = useMapStore((state) => state.setSelectedObject);

  const analysisProject = useMemo(
    () => {
      if (!hasActiveTerritory) return { ...project, buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [] };
      const layers: FormiqLayerData[] = project.layers.length
        ? project.layers
        : project.layerSystem.map((layer) => layer.data).filter((data): data is FormiqLayerData => Boolean(data && "buildings" in data));
      const fusion = project.fusion?.collections;
      return {
        ...project,
        buildings: project.buildings.length ? project.buildings : (layers.flatMap((layer) => layer.buildings).length ? layers.flatMap((layer) => layer.buildings) : fusion?.buildings ?? []),
        roads: project.roads.length ? project.roads : (layers.flatMap((layer) => layer.roads).length ? layers.flatMap((layer) => layer.roads) : fusion?.roads ?? []),
        vegetation: project.vegetation.length ? project.vegetation : (layers.flatMap((layer) => layer.vegetation).length ? layers.flatMap((layer) => layer.vegetation) : fusion?.vegetation ?? []),
        water: project.water.length ? project.water : (layers.flatMap((layer) => layer.water).length ? layers.flatMap((layer) => layer.water) : fusion?.water ?? []),
        terrain: project.terrain.length ? project.terrain : (layers.flatMap((layer) => layer.terrain).length ? layers.flatMap((layer) => layer.terrain) : fusion?.terrain ?? []),
        boundaries: project.boundaries.length ? project.boundaries : (layers.flatMap((layer) => layer.boundaries ?? []).length ? layers.flatMap((layer) => layer.boundaries ?? []) : fusion?.boundaries ?? []),
        poi: project.poi.length ? project.poi : (layers.flatMap((layer) => layer.poi ?? []).length ? layers.flatMap((layer) => layer.poi ?? []) : fusion?.poi ?? []),
        transitStops: project.transitStops.length ? project.transitStops : (layers.flatMap((layer) => layer.transitStops ?? []).length ? layers.flatMap((layer) => layer.transitStops ?? []) : fusion?.transitStops ?? []),
      };
    },
    [hasActiveTerritory, project]
  );
  const analysis = useMemo(() => analysisEngine.analyze(analysisProject), [analysisProject]);
  const model = useMemo(() => buildAnalysisModel(analysis), [analysis]);
  const activeLayer = getAnalysisLayerDefinition(activeLayerId);
  const activeScenario = getAnalysisScenario(storedActiveScenarioId);
  const compareScenario = getAnalysisScenario(storedCompareScenarioId);
  const activeScenarioId = activeScenario.id;
  const compareScenarioId = compareScenario.id;
  const mobileTab = mobileTabs.includes(routePanel as MobileAnalysisTab) ? routePanel as MobileAnalysisTab : "metrics";

  const activeMetrics = useMemo(
    () => createAnalysisMetricViewModels(activeLayer, analysis, model),
    [activeLayer, analysis, model]
  );
  const activeProjection = useMemo(() => projectScenario(model, activeScenario), [activeScenario, model]);
  const compareProjection = useMemo(() => projectScenario(model, compareScenario), [compareScenario, model]);
  const thematicMap = useMemo(
    () => thematicMapEngine.generate(activeLayer.thematicMapType ?? "none", project, analysis),
    [activeLayer.thematicMapType, analysis, project]
  );
  const legend = useMemo(
    () => createAnalysisLegendViewModel(activeLayer, thematicMap),
    [activeLayer, thematicMap]
  );

  useEffect(() => {
    if (storedActiveLayerId !== activeLayerId) setActiveLayerId(activeLayerId);
  }, [activeLayerId, setActiveLayerId, storedActiveLayerId]);

  useEffect(() => {
    if (storedActiveScenarioId !== activeScenarioId) setActiveScenarioId(activeScenarioId);
    if (storedCompareScenarioId !== compareScenarioId) setCompareScenarioId(compareScenarioId);
  }, [activeScenarioId, compareScenarioId, setActiveScenarioId, setCompareScenarioId, storedActiveScenarioId, storedCompareScenarioId]);

  useEffect(() => {
    if (analysisViewMode === "3d" && !activeLayer.visualization.supports3D) setAnalysisViewMode("2d");
  }, [activeLayer.visualization.supports3D, analysisViewMode, setAnalysisViewMode]);

  useEffect(() => {
    hydrateAnalysis(analysis, project.id, project.metadata.updatedAt);
  }, [analysis, hydrateAnalysis, project.id, project.metadata.updatedAt]);

  const centerMap = useCallback(() => {
    const map = (window as unknown as { __formiqMap?: { easeTo: (options: { center: [number, number]; zoom: number; duration: number }) => void } }).__formiqMap;
    map?.easeTo({ center: project.settings.display.mapCenter, zoom: project.settings.display.mapZoom, duration: 650 });
  }, [project.settings.display.mapCenter, project.settings.display.mapZoom]);

  const changeLayer = useCallback((id: AnalysisLayerId) => {
    setActiveLayerId(id);
    setSelectedObject(null);
  }, [setActiveLayerId, setSelectedObject]);

  const changeScenario = useCallback((id: AnalysisScenarioId) => setActiveScenarioId(id), [setActiveScenarioId]);
  const changeCompareScenario = useCallback((id: AnalysisScenarioId) => setCompareScenarioId(id), [setCompareScenarioId]);

  return (
    <main
      className="relative h-full min-h-0 overflow-hidden bg-[#F8FAFC] text-[#0F172A]"
      data-active-analysis-layer={activeLayer.id}
      data-analysis-status={activeLayer.status}
      data-analysis-state={activeMetrics[0]?.state ?? legend.state}
      data-thematic-map-type={activeLayer.thematicMapType ?? "none"}
      data-analysis-view={analysisViewMode}
    >
      <AnalysisMap
        viewMode={analysisViewMode}
        thematicMapType={activeLayer.thematicMapType ?? "none"}
        thematicMap={thematicMap}
        opacity={analysisLayerOpacity}
      />

      {!hasActiveTerritory ? (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#0F172A]/20 backdrop-blur-[2px]">
          <div className="max-w-md rounded-[20px] border border-white/70 bg-white/78 p-6 text-center shadow-sm backdrop-blur-3xl">
            <p className="text-lg font-semibold text-[#0F172A]">Территория не выбрана</p>
            <p className="mt-2 text-sm text-[#64748B]">Сначала выберите территорию в разделе «Архитектура». Анализ ограничен текущей областью.</p>
            <a href="/map" className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-[#229ED9] px-4 text-sm font-semibold text-white">Выбрать территорию</a>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(248,250,252,.16),transparent_18%,transparent_78%,rgba(248,250,252,.5))]" aria-hidden="true" />

      <AnalysisLayerSelector
        layers={readyAnalysisLayers}
        activeLayerId={activeLayerId}
        collapsed={Boolean(analysisPanels.navigation)}
        onChange={changeLayer}
        onOverview={() => {
          setAnalysisPanelCollapsed("metrics", false);
          setAnalysisPanelCollapsed("bottomMetrics", false);
        }}
        onOpenScenarios={() => setAnalysisPanelCollapsed("scenarios", false)}
        onCollapsedChange={(collapsed) => setAnalysisPanelCollapsed("navigation", collapsed)}
      />
      <MetricPanel
        layer={activeLayer}
        metrics={activeMetrics}
        collapsed={Boolean(analysisPanels.metrics)}
        navigationCollapsed={Boolean(analysisPanels.navigation)}
        onCollapsedChange={(collapsed) => setAnalysisPanelCollapsed("metrics", collapsed)}
        onShowSummary={() => setAnalysisPanelCollapsed("bottomMetrics", false)}
      />
      <AnalysisMapToolbar
        layer={activeLayer}
        scenario={activeScenario}
        analysisStatus={analysisStatus}
        viewMode={analysisViewMode}
        opacity={analysisLayerOpacity}
        onViewModeChange={setAnalysisViewMode}
        onOpacityChange={setAnalysisLayerOpacity}
        onOpenScenarios={() => setAnalysisPanelCollapsed("scenarios", false)}
      />
      <AnalysisMapControls viewMode={analysisViewMode} onViewModeChange={setAnalysisViewMode} onCenterMap={centerMap} />
      <ScenarioPanel
        scenarios={analysisScenarios}
        activeScenarioId={activeScenarioId}
        compareScenarioId={compareScenarioId}
        activeProjection={activeProjection}
        compareProjection={compareProjection}
        comparisonMode={comparisonMode}
        collapsed={Boolean(analysisPanels.scenarios)}
        onActiveChange={changeScenario}
        onCompareChange={changeCompareScenario}
        onComparisonModeChange={setComparisonMode}
        onCollapsedChange={(collapsed) => setAnalysisPanelCollapsed("scenarios", collapsed)}
        onCompleteAnalysis={() => completeWorkflowStage("analysis")}
      />
      <BottomMetrics
        metrics={activeMetrics}
        collapsed={Boolean(analysisPanels.bottomMetrics)}
        navigationCollapsed={Boolean(analysisPanels.navigation)}
        onCollapsedChange={(collapsed) => setAnalysisPanelCollapsed("bottomMetrics", collapsed)}
      />
      <MapLegend legend={legend} />
      <MapSelectionPopover selectedObject={selectedObject} onClose={() => setSelectedObject(null)} />
      <AnalysisStatusBar
        sources={project.dataSources.filter((source) => source.status === "active").map((source) => source.name)}
        updatedAt={project.metadata.updatedAt}
        scaleLabel={scaleLabel}
        coordinates={cursorCoordinates}
        coveragePercent={getCoveragePercent(activeLayer.id, analysis)}
        coverageReason={getCoverageReason(activeLayer.id, analysis)}
      />
      <MobileAnalysisDock
        activeTab={mobileTab}
        collapsed={Boolean(analysisPanels.mobile)}
        layers={readyAnalysisLayers}
        activeLayer={activeLayer}
        metrics={activeMetrics}
        scenarios={analysisScenarios}
        activeScenarioId={activeScenarioId}
        legend={legend}
        onTabChange={(tab) => setRoutePanel("/analysis", tab)}
        onCollapsedChange={(collapsed) => setAnalysisPanelCollapsed("mobile", collapsed)}
        onLayerChange={changeLayer}
        onScenarioChange={changeScenario}
        onCompleteAnalysis={() => completeWorkflowStage("analysis")}
      />
    </main>
  );
}

function getCoveragePercent(layerId: string, analysis: ReturnType<typeof analysisEngine.analyze>): number {
  if (layerId === "building-age") return analysis.buildings.ageCoveragePercent;
  if (layerId === "building-function") return analysis.buildings.functionCoveragePercent;
  if (layerId === "floor-count") return analysis.buildings.floorCoveragePercent;
  if (layerId === "terrain") return analysis.terrain.coveragePercent;
  if (layerId === "poi-transit" || layerId === "transit-accessibility") return analysis.accessibility.coveragePercent;
  if (layerId === "population-density") return analysis.buildings.populationCoveragePercent;
  if (layerId === "built-density") return analysis.buildings.count > 0 ? 100 : 0;
  return 100;
}

function getCoverageReason(layerId: string, analysis: ReturnType<typeof analysisEngine.analyze>): string | null {
  if (layerId === "terrain") return analysis.terrain.reason;
  if (layerId === "poi-transit" || layerId === "transit-accessibility") return analysis.accessibility.reason;
  return analysis.buildings.dataNotes.find((note) =>
    layerId === "building-age" ? note.startsWith("Возраст") : layerId === "building-function" ? note.startsWith("Функции") : layerId === "population-density" ? note.startsWith("Население") : false
  ) ?? null;
}
