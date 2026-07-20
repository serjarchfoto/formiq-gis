"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnalysisContextResolver,
  AnalysisEngine,
  AnalysisExecutionError,
  ThematicMapEngine,
  getAnalysisDefinition,
  type AnalysisContext,
  type AnalysisExecutionResult,
  type CanonicalDomain,
  type TerritoryReference,
  createBrowserDataAcquisitionOrchestrator,
  type DataAcquisitionJob,
} from "@/lib";
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
import type { FormiqProjectData } from "@/types/formiq";
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
const analysisContextResolver = new AnalysisContextResolver();
const thematicMapEngine = new ThematicMapEngine();
const readyAnalysisLayers = getReadyAnalysisLayers();
const mobileTabs: MobileAnalysisTab[] = ["layers", "metrics", "scenarios", "legend"];
const acquisitionOrchestrator = createBrowserDataAcquisitionOrchestrator();

export type AnalysisWorkspaceState =
  | "territory_not_selected"
  | "loading_context"
  | "ready"
  | "degraded"
  | "missing_required_data"
  | "acquisition_available"
  | "acquisition_running"
  | "analysis_running"
  | "analysis_failed";

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
  const [workspaceState, setWorkspaceState] = useState<AnalysisWorkspaceState>(hasActiveTerritory ? "loading_context" : "territory_not_selected");
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext | null>(null);
  const [execution, setExecution] = useState<AnalysisExecutionResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [acquisitionJob, setAcquisitionJob] = useState<DataAcquisitionJob | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const requestKey = `${project.id}:${activeTerritory?.id ?? "none"}:${activeLayerId}:${project.metadata.updatedAt}`;
  const renderedWorkspaceState: AnalysisWorkspaceState = !activeTerritory
    ? "territory_not_selected"
    : loadedRequestKey === requestKey ? workspaceState : "loading_context";
  const emptyProject = useMemo(() => withoutAnalysisCollections(project), [project]);
  const analysis = useMemo(() => execution?.result ?? analysisEngine.analyze(emptyProject), [emptyProject, execution]);
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
    () => thematicMapEngine.generate(activeLayer.thematicMapType ?? "none", analysisContext?.project ?? emptyProject, analysis),
    [activeLayer.thematicMapType, analysis, analysisContext?.project, emptyProject]
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
    if (execution) hydrateAnalysis(analysis, project.id, project.metadata.updatedAt);
  }, [analysis, execution, hydrateAnalysis, project.id, project.metadata.updatedAt]);

  useEffect(() => {
    let cancelled = false;
    if (!activeTerritory) {
      return () => { cancelled = true; };
    }

    const territory = toTerritoryReference(project, activeTerritory);
    void analysisContextResolver.load({ analysisId: activeLayerId, project, territory })
      .then(async (context) => {
        if (cancelled) return;
        setLoadedRequestKey(requestKey);
        setExecution(null);
        setAnalysisError(null);
        setAnalysisContext(context);
        const definition = getAnalysisDefinition(activeLayerId);
        const missingFeatures = context.dataHub.missingRequirements.some(
          (requirement) => requirement.required && (context.dataHub.features[requirement.domain]?.length ?? 0) === 0
        );
        const missingAny = definition.requiresAnyDomain?.every(
          (domain) => (context.dataHub.features[domain]?.length ?? 0) === 0
        ) ?? false;
        if (missingFeatures || missingAny || (context.dataHub.degraded && !definition.supportsDegradedMode)) {
          setWorkspaceState("missing_required_data");
          return;
        }
        setWorkspaceState("analysis_running");
        const next = await analysisEngine.runAnalysis({ analysisId: activeLayerId, context });
        if (cancelled) return;
        setExecution(next);
        setWorkspaceState(next.state);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadedRequestKey(requestKey);
        setExecution(null);
        setAnalysisContext(null);
        if (error instanceof AnalysisExecutionError && (error.code === "MISSING_REQUIRED_DATA" || error.code === "DEGRADED_NOT_SUPPORTED")) {
          setWorkspaceState("missing_required_data");
          return;
        }
        setAnalysisError(error instanceof Error ? error.message : "Не удалось подготовить данные анализа.");
        setWorkspaceState("analysis_failed");
      });
    return () => { cancelled = true; };
  }, [activeLayerId, activeTerritory, project, requestKey]);

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
  const startAcquisition = useCallback(() => {
    if (!activeTerritory) return;
    const territory = toTerritoryReference(project, activeTerritory);
    const requirements = getAnalysisDefinition(activeLayerId).requirements;
    setWorkspaceState("acquisition_running");
    void acquisitionOrchestrator.startAcquisition({
      projectId: project.id,
      territory,
      requestedDomains: requirements.map((requirement) => requirement.domain),
      requirements,
    }).then((job) => {
      setAcquisitionJob(job);
      setWorkspaceState(job.status === "completed" ? "loading_context" : job.status === "waiting_manual_review" ? "acquisition_available" : "missing_required_data");
    }).catch((error: unknown) => {
      setAnalysisError(error instanceof Error ? error.message : "Не удалось запустить получение данных.");
      setWorkspaceState("analysis_failed");
    });
  }, [activeLayerId, activeTerritory, project, setAcquisitionJob, setAnalysisError, setWorkspaceState]);

  return (
    <main
      className="relative h-full min-h-0 overflow-hidden bg-[#F8FAFC] text-[#0F172A]"
      data-active-analysis-layer={activeLayer.id}
      data-analysis-status={activeLayer.status}
      data-analysis-state={activeMetrics[0]?.state ?? legend.state}
      data-thematic-map-type={activeLayer.thematicMapType ?? "none"}
      data-analysis-view={analysisViewMode}
      data-analysis-workspace-state={renderedWorkspaceState}
      data-analysis-context-source={analysisContext?.source ?? "none"}
      data-acquisition-job-status={acquisitionJob?.status ?? "none"}
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

      {hasActiveTerritory && ["loading_context", "analysis_running", "missing_required_data", "acquisition_available", "acquisition_running", "analysis_failed"].includes(renderedWorkspaceState) ? (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#0F172A]/20 backdrop-blur-[2px]">
          <div className="max-w-md rounded-[20px] border border-white/70 bg-white/78 p-6 text-center shadow-sm backdrop-blur-3xl">
            <p className="text-lg font-semibold text-[#0F172A]">{workspaceStateTitle(renderedWorkspaceState)}</p>
            <p className="mt-2 text-sm text-[#64748B]">{workspaceStateMessage(renderedWorkspaceState, analysisContext, analysisError)}</p>
            {renderedWorkspaceState === "missing_required_data" ? (
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-[#229ED9] px-4 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
                onClick={startAcquisition}
              >
                Получить недостающие данные
              </button>
            ) : null}
            {renderedWorkspaceState === "acquisition_available" ? (
              <a href="/map" className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-[#229ED9] px-4 text-sm font-semibold text-white">Открыть получение данных</a>
            ) : null}
          </div>
        </div>
      ) : null}

      {renderedWorkspaceState === "degraded" ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-[14px] border border-amber-200/70 bg-amber-50/80 px-4 py-2 text-xs font-medium text-amber-900 backdrop-blur-3xl">
          Анализ выполнен с ограничениями качества: {analysisContext?.warnings[0] ?? "часть данных неполна или имеет неизвестное покрытие."}
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
        sources={analysisContext ? getContextSourceIds(analysisContext) : []}
        updatedAt={analysisContext?.dataHub.quality.createdAt ?? project.metadata.updatedAt}
        scaleLabel={scaleLabel}
        coordinates={cursorCoordinates}
        coveragePercent={getCoveragePercent(activeLayer.id, analysis, analysisContext)}
        coverageReason={getCoverageReason(activeLayer.id, analysis, analysisContext)}
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

function getCoveragePercent(
  layerId: string,
  analysis: ReturnType<typeof analysisEngine.analyze>,
  context: AnalysisContext | null
): number | undefined {
  const domain = primaryDomain(layerId);
  const canonicalCoverage = domain ? context?.dataHub.quality.domains[domain]?.coverageScore : null;
  if (typeof canonicalCoverage === "number") return canonicalCoverage * 100;
  if (context?.source !== "legacy") return undefined;
  if (layerId === "building-age") return analysis.buildings.ageCoveragePercent;
  if (layerId === "building-function") return analysis.buildings.functionCoveragePercent;
  if (layerId === "floor-count") return analysis.buildings.floorCoveragePercent;
  if (layerId === "terrain") return analysis.terrain.coveragePercent;
  if (layerId === "poi-transit" || layerId === "transit-accessibility") return analysis.accessibility.coveragePercent;
  if (layerId === "population-density") return analysis.buildings.populationCoveragePercent;
  return undefined;
}

function getCoverageReason(layerId: string, analysis: ReturnType<typeof analysisEngine.analyze>, context: AnalysisContext | null): string | null {
  const domain = primaryDomain(layerId);
  const quality = domain ? context?.dataHub.quality.domains[domain] : undefined;
  if (quality?.coverageScore === null) return "Покрытие не измерено; Data Hub не подставляет 0% или 100%.";
  if (quality?.warnings[0]) return quality.warnings[0];
  if (layerId === "terrain") return analysis.terrain.reason;
  if (layerId === "poi-transit" || layerId === "transit-accessibility") return analysis.accessibility.reason;
  return analysis.buildings.dataNotes.find((note) =>
    layerId === "building-age" ? note.startsWith("Возраст") : layerId === "building-function" ? note.startsWith("Функции") : layerId === "population-density" ? note.startsWith("Население") : false
  ) ?? null;
}

function primaryDomain(layerId: string): CanonicalDomain | null {
  if (["floor-count", "building-age", "building-function", "built-density", "population-density"].includes(layerId)) return "building";
  if (layerId === "roads" || layerId === "pedestrian-accessibility" || layerId === "noise") return "road";
  if (layerId === "greenery") return "green_area";
  if (layerId === "water") return "waterbody";
  if (layerId === "terrain" || layerId === "elevation-analysis") return "terrain";
  if (layerId === "poi-transit" || layerId === "transit-accessibility") return "transport_stop";
  return null;
}

function toTerritoryReference(
  project: FormiqProjectData,
  territory: FormiqProjectData["territories"][number]
): TerritoryReference {
  return {
    id: territory.id,
    projectId: project.id,
    geometry: territory.geometry.geometry,
    bbox: [territory.bounds.west, territory.bounds.south, territory.bounds.east, territory.bounds.north],
    crs: project.crs,
  };
}

function withoutAnalysisCollections(project: FormiqProjectData): FormiqProjectData {
  return {
    ...project,
    layers: [], layerSystem: [], fusion: null,
    buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [],
  };
}

function getContextSourceIds(context: AnalysisContext): string[] {
  return [...new Set(Object.values(context.dataHub.quality.domains).flatMap((domain) => domain?.sourceIds ?? []))];
}

function workspaceStateTitle(state: AnalysisWorkspaceState): string {
  if (state === "loading_context") return "Подготовка данных";
  if (state === "analysis_running") return "Выполняется анализ";
  if (state === "missing_required_data") return "Недостаточно данных";
  if (state === "acquisition_available") return "Можно дополнить данные";
  return "Анализ не выполнен";
}

function workspaceStateMessage(state: AnalysisWorkspaceState, context: AnalysisContext | null, error: string | null): string {
  if (state === "loading_context") return "Data Hub формирует единый canonical context для выбранной территории.";
  if (state === "analysis_running") return "Расчёт выполняется только по данным canonical context.";
  if (state === "missing_required_data") {
    const domains = context?.dataHub.missingRequirements.map((item) => item.domain).join(", ");
    return domains ? `Не выполнены требования по слоям: ${domains}.` : "Не найден обязательный слой для выбранного анализа.";
  }
  if (state === "acquisition_available") return "Запустите единый импорт территории: агент получения данных сможет подобрать недостающие источники.";
  return error ?? "Проверьте canonical snapshot и отчёт качества Data Hub.";
}
