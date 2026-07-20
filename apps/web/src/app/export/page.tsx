"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createDefaultExportEngine, type ExportFormat } from "@/lib";
import { AnalysisEngine } from "@/lib/gis-engine/analysis";
import { ThematicMapEngine, type ThematicMapDefinition } from "@/lib/gis-engine/thematic";
import { getAnalysisExportSelection } from "@/features/analysis";
import { importUnifiedContextByBoundingBox } from "@/features/import";
import { clipProjectToArea } from "@/features/selection/areaService";
import { buildAnalysisModel, projectScenario } from "@/features/analysis/model";
import {
  auditPresentationMap,
  getBuildingPopulation,
  getPresentationMapPreset,
  getPresentationDataRequirement,
  hasKnownBuildingHeight,
  presentationMapPresets,
  resolveProjectPresentationData,
  type PresentationDataAudit,
  type PresentationMapPreset,
  type PresentationMapPresetId,
} from "@/features/presentation";
import { buildLayoutDocument, createPageDefinition } from "@/features/presentation/layoutDocument";
import { PngLayoutRenderer, RasterPdfLayoutRenderer, SvgLayoutRenderer, renderRasterPdfAlbum, type RasterSheet } from "@/features/presentation/renderers";
import { useAnalysisStore } from "@/store/analysis";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { FormiqEntity, FormiqGeometry, FormiqProjectData, FormiqTerritory, ImportSourceId } from "@/types/formiq";
import type { BoundingBox } from "@/types/gis";

type PaperFormat = "A4" | "A3" | "A2" | "A1" | "A0";
type Orientation = "landscape" | "portrait";
type ExportId = "pdf" | "svg" | "png" | "illustrator" | "dxf" | "geojson" | "shapefile" | "formiq" | "album";
type SheetObjectType = "text" | "shape" | "line" | "image";
type ExpandedPanel = "format" | "orientation" | "margins" | "grid" | "labels" | "legend" | "scale" | "resolution" | "north" | "info" | "add" | null;

interface SheetObject {
  id: string;
  type: SheetObjectType;
  label: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SheetSettings {
  mapPresetId: PresentationMapPresetId;
  pageFormat: PaperFormat;
  orientation: Orientation;
  marginsMm: number;
  gutterMm: number;
  gridStepMm: number;
  units: "mm" | "cm";
  showFrame: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  showLabels: boolean;
  showInfoBlock: boolean;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  scale: string;
  zoom: number;
  exportFormat: ExportId;
  selectedTemplate: string;
  rasterDpi: 300 | 600;
}

const exportEngine = createDefaultExportEngine();
const analysisEngine = new AnalysisEngine();
const thematicMapEngine = new ThematicMapEngine();
const sheetWidth = 1120;
const mapContextPaddingRatio = 0.12;
const paperSizes: Record<PaperFormat, { width: number; height: number }> = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
};
const exportItems: Array<{ id: ExportId; title: string; subtitle: string; color: string }> = [
  { id: "album", title: "PDF альбом", subtitle: "Все доступные аналитические карты", color: "#0F766E" },
  { id: "pdf", title: "PDF", subtitle: "Печатный документ", color: "#EF4444" },
  { id: "svg", title: "SVG", subtitle: "Векторная графика", color: "#8B5CF6" },
  { id: "png", title: "PNG", subtitle: "Растровое изображение", color: "#22C55E" },
  { id: "illustrator", title: "Illustrator", subtitle: "Adobe Illustrator", color: "#F59E0B" },
  { id: "dxf", title: "DXF", subtitle: "CAD-формат", color: "#229ED9" },
  { id: "geojson", title: "GeoJSON", subtitle: "Геопространственные данные", color: "#14B8A6" },
  { id: "shapefile", title: "Shapefile", subtitle: "ESRI Shapefile package", color: "#8B6F55" },
  { id: "formiq", title: "Проект FORMIQ", subtitle: "Сохранить проект", color: "#94A3B8" },
];

export default function ExportPage() {
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  const completeWorkflowStage = useUIStore((state) => state.completeWorkflowStage);
  const activeAnalysisLayerId = useUIStore((state) => state.activeAnalysisLayerId);
  const activeScenarioId = useUIStore((state) => state.activeScenarioId);
  const storedAnalysis = useAnalysisStore((state) => state.result);
  const storedAnalysisProjectId = useAnalysisStore((state) => state.projectId);
  const [settings, setSettings] = useState<SheetSettings>(() => ({
    mapPresetId: "building-floors",
    pageFormat: ["A4", "A3", "A2", "A1", "A0"].includes(project.settings.export.paperFormat) ? project.settings.export.paperFormat as PaperFormat : "A3",
    orientation: "landscape",
    marginsMm: 5,
    gutterMm: 8,
    gridStepMm: 10,
    units: "mm",
    showFrame: true,
    showGrid: false,
    showLegend: true,
    showScaleBar: true,
    showNorthArrow: true,
    showLabels: true,
    showInfoBlock: true,
    title: "Карта анализа",
    subtitle: project.name,
    author: project.settings.export.author || project.author || "FORMIQ Studio",
    date: new Intl.DateTimeFormat("ru-RU").format(new Date()),
    scale: "1:2000",
    zoom: 55,
    exportFormat: "pdf",
    selectedTemplate: "Базовый",
    rasterDpi: 300,
  }));
  const [sheetObjects, setSheetObjects] = useState<SheetObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const [status, setStatus] = useState("Лист готов к настройке");
  const [customTemplates, setCustomTemplates] = useState<Array<{ name: string; settings: SheetSettings }>>([]);
  const [isLoadingMissingData, setIsLoadingMissingData] = useState(false);
  const editorRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<SheetSettings[]>([]);
  const futureRef = useRef<SheetSettings[]>([]);
  const resolvedPresentationData = useMemo(() => resolveProjectPresentationData(project), [project]);
  const exportProject = resolvedPresentationData.project;
  const activeTerritory = exportProject.territories.find((territory) => territory.id === exportProject.activeTerritoryId) ?? exportProject.territories.find((territory) => territory.isActive);
  const analysisProject = useMemo(() => clipProjectToArea(exportProject, activeTerritory ? { shape: activeTerritory.shape ?? "polygon", bounds: activeTerritory.bounds, geometry: activeTerritory.geometry } : null), [activeTerritory, exportProject]);
  const computedAnalysis = useMemo(() => analysisEngine.analyze(analysisProject), [analysisProject]);
  const storedAnalysisMatchesProject = Boolean(
    storedAnalysisProjectId === project.id &&
    storedAnalysis &&
    storedAnalysis.buildings.floorTheme.length === analysisProject.buildings.length
  );
  const analysis = storedAnalysisMatchesProject && storedAnalysis ? storedAnalysis : computedAnalysis;
  const analysisModel = useMemo(() => buildAnalysisModel(analysis), [analysis]);
  const activeMapPreset = getPresentationMapPreset(settings.mapPresetId);
  const activeMapAudit = useMemo(() => auditPresentationMap(analysisProject, settings.mapPresetId), [analysisProject, settings.mapPresetId]);
  const exportSelection = getAnalysisExportSelection(activeAnalysisLayerId, activeScenarioId);
  const activeScenario = exportSelection.scenario;
  const activeProjection = useMemo(() => projectScenario(analysisModel, activeScenario), [activeScenario, analysisModel]);
  const thematicMap = useMemo(
    () => thematicMapEngine.generate(activeMapPreset.thematicMapType, analysisProject, analysis),
    [activeMapPreset.thematicMapType, analysis, analysisProject]
  );
  const automaticScale = useMemo(() => calculateAutomaticScale(exportProject, settings.pageFormat, settings.orientation, settings.marginsMm), [exportProject, settings.pageFormat, settings.orientation, settings.marginsMm]);
  const effectiveSettings = useMemo(() => settings.scale === automaticScale ? settings : { ...settings, scale: automaticScale }, [automaticScale, settings]);
  const dataRequirement = getPresentationDataRequirement(settings.mapPresetId);
  const preview = useMemo(() => buildSheetPreview(exportProject, analysisProject, effectiveSettings, activeMapPreset, activeMapAudit, dataRequirement, thematicMap, analysisModel, activeProjection, sheetObjects), [analysisProject, exportProject, effectiveSettings, activeMapPreset, activeMapAudit, dataRequirement, thematicMap, analysisModel, activeProjection, sheetObjects]);
  const layoutDocument = useMemo(() => buildLayoutDocument({
    previewZoom: effectiveSettings.zoom,
    rasterDpi: effectiveSettings.rasterDpi,
    page: createPageDefinition(effectiveSettings.pageFormat, effectiveSettings.orientation, effectiveSettings.marginsMm),
    map: {
      x: getSheetLayout(getPaper(effectiveSettings.pageFormat, effectiveSettings.orientation), effectiveSettings.marginsMm).mapBox.x,
      y: getSheetLayout(getPaper(effectiveSettings.pageFormat, effectiveSettings.orientation), effectiveSettings.marginsMm).mapBox.y,
      width: getSheetLayout(getPaper(effectiveSettings.pageFormat, effectiveSettings.orientation), effectiveSettings.marginsMm).mapBox.width,
      height: getSheetLayout(getPaper(effectiveSettings.pageFormat, effectiveSettings.orientation), effectiveSettings.marginsMm).mapBox.height,
      bounds: getExportBounds(exportProject),
      scaleDenominator: Number(effectiveSettings.scale.replace("1:", "")) || 0,
      sourceCrs: resolvedPresentationData.sourceCrs,
      displayCrs: resolvedPresentationData.displayCrs,
      thematicMapId: activeMapPreset.id,
    },
    elements: sheetObjects,
    metadata: {
      title: effectiveSettings.title,
      subtitle: effectiveSettings.subtitle,
      author: effectiveSettings.author,
      date: effectiveSettings.date,
      projectId: exportProject.id,
      projectName: exportProject.name,
      sourceCrs: resolvedPresentationData.sourceCrs,
      displayCrs: resolvedPresentationData.displayCrs,
      provenance: activeMapAudit.sources,
    },
    readiness: {
      state: activeMapAudit.readiness,
      coveragePercent: activeMapAudit.coveragePercent,
      knownCount: activeMapAudit.knownCount,
      totalCount: activeMapAudit.totalCount,
      summary: activeMapAudit.summary,
    },
    svgMarkup: preview.svg,
  }), [activeMapAudit, activeMapPreset.id, effectiveSettings, exportProject, preview.svg, resolvedPresentationData, sheetObjects]);
  const albumDocuments = useMemo(() => presentationMapPresets.flatMap((preset) => {
    const audit = auditPresentationMap(analysisProject, preset.id);
    if (audit.readiness === "no-data" || audit.readiness === "unsupported") return [];
    const requirement = getPresentationDataRequirement(preset.id);
    const thematic = thematicMapEngine.generate(preset.thematicMapType, analysisProject, analysis);
    const settingsForMap = { ...effectiveSettings, mapPresetId: preset.id, title: preset.title };
    const mapPreview = buildSheetPreview(exportProject, analysisProject, settingsForMap, preset, audit, requirement, thematic, analysisModel, activeProjection, sheetObjects);
    return [createLayoutDocumentForPreview(exportProject, settingsForMap, preset, audit, mapPreview.svg, sheetObjects, resolvedPresentationData.sourceCrs, resolvedPresentationData.displayCrs)];
  }), [activeProjection, analysis, analysisModel, analysisProject, effectiveSettings, exportProject, resolvedPresentationData.displayCrs, resolvedPresentationData.sourceCrs, sheetObjects]);
  const paper = getPaper(effectiveSettings.pageFormat, effectiveSettings.orientation);
  const selectedObject = sheetObjects.find((object) => object.id === selectedObjectId) ?? null;

  const update = <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => setSettings((current) => {
    if (current[key] === value) return current;
    historyRef.current = [...historyRef.current.slice(-39), current];
    futureRef.current = [];
    return { ...current, [key]: value };
  });

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [settings, ...futureRef.current].slice(0, 40);
    setSettings(previous);
  }, [settings]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current.slice(-39), settings];
    setSettings(next);
  }, [settings]);

  const addSheetObject = (type: SheetObjectType) => {
    const labels: Record<SheetObjectType, string> = { text: "Текст", shape: "Фигура", line: "Линия", image: "Изображение" };
    const object = { id: `${type}-${Date.now()}`, type, label: `${labels[type]} ${sheetObjects.filter((item) => item.type === type).length + 1}`, visible: true, x: 18, y: 38, width: type === "line" ? 18 : 14, height: type === "text" ? 5 : 9 };
    setSheetObjects((current) => [...current, object]);
    setSelectedObjectId(object.id);
    setExpandedPanel(null);
    setStatus(`${labels[type]} добавлен на лист`);
  };

  const updateObject = (id: string, patch: Partial<SheetObject>) => setSheetObjects((current) => current.map((object) => object.id === id ? { ...object, ...patch } : object));
  const deleteObject = useCallback((id: string) => {
    setSheetObjects((current) => current.filter((object) => object.id !== id));
    setSelectedObjectId(null);
    setStatus("Элемент удалён с листа");
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement && editorRef.current) await editorRef.current.requestFullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
  };

  const applyTemplate = (name: string) => {
    const patchByTemplate: Record<string, Partial<SheetSettings>> = {
      "Базовый": { showFrame: true, showGrid: false, showLegend: true, showScaleBar: true, showNorthArrow: true, showLabels: true, showInfoBlock: true },
      "Минимализм": { showFrame: false, showGrid: false, showLegend: true, showScaleBar: true, showNorthArrow: true, showLabels: false, showInfoBlock: false },
      "Классика": { showFrame: true, showGrid: false, showLegend: true, showScaleBar: true, showNorthArrow: true, showLabels: true, showInfoBlock: true },
      "Сетка": { showFrame: true, showGrid: true, showLegend: true, showScaleBar: true, showNorthArrow: true, showLabels: true, showInfoBlock: true },
      "Светлый": { showFrame: false, showGrid: true, showLegend: true, showScaleBar: true, showNorthArrow: false, showLabels: true, showInfoBlock: false },
    };
    setSettings((current) => {
      historyRef.current = [...historyRef.current.slice(-39), current];
      futureRef.current = [];
      const custom = customTemplates.find((item) => item.name === name)?.settings;
      return { ...current, ...(custom ?? patchByTemplate[name] ?? {}), selectedTemplate: name };
    });
  };

  const createTemplate = () => {
    const name = `Мой шаблон ${customTemplates.length + 1}`;
    setCustomTemplates((current) => [...current, { name, settings: effectiveSettings }]);
    setSettings((current) => ({ ...current, selectedTemplate: name }));
    setStatus(`${name} сохранён`);
  };

  const loadMissingData = async () => {
    if (!dataRequirement.canAutoLoad || isLoadingMissingData) return;
    const territory = project.territories.find((item) => item.id === project.activeTerritoryId) ?? project.territories.find((item) => item.isActive);
    const bounds = territory?.bounds ?? project.metadata.bounds;
    if (!bounds) {
      setStatus("Не удалось определить границы активной территории");
      return;
    }

    const sourceByPreset: Partial<Record<PresentationMapPresetId, ImportSourceId[]>> = {
      "population-grid": ["wikidata", "osm"],
      "population-heatmap": ["wikidata", "osm"],
      "transit-access": ["osm"],
      "terrain-height": ["copernicus-dem"],
      "building-floors": ["osm", "microsoft-buildings"],
      "building-age": ["osm", "wikidata"],
      "functional-zoning": ["osm", "city-geojson"],
      "axonometric-zoning": ["osm", "copernicus-dem"],
    };
    const sources = sourceByPreset[settings.mapPresetId] ?? (dataRequirement.sourceId ? [dataRequirement.sourceId as ImportSourceId] : []);
    setIsLoadingMissingData(true);
    setStatus(`Загрузка: ${dataRequirement.source}...`);
    try {
      await importUnifiedContextByBoundingBox(bounds, {
        sources,
        existingProject: project,
        onProjectUpdate: async (projectedProject) => {
          await setProject(projectedProject.id, projectedProject);
        },
      });
      setStatus("Данные загружены, аналитика обновлена");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось загрузить недостающие данные");
    } finally {
      setIsLoadingMissingData(false);
    }
  };

  const applyMapPreset = (presetId: PresentationMapPresetId) => {
    const preset = getPresentationMapPreset(presetId);
    setSettings((current) => {
      historyRef.current = [...historyRef.current.slice(-39), current];
      futureRef.current = [];
      return {
        ...current,
        mapPresetId: preset.id,
        title: preset.title,
        showLegend: true,
        showScaleBar: true,
        showNorthArrow: preset.id !== "axonometric-zoning",
        showLabels: !["terrain-height", "axonometric-zoning", "shadow-analysis"].includes(preset.id),
      };
    });
    setStatus(`Выбрана карта «${preset.shortTitle}»`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedObjectId(null);
      if (event.key === "Delete" && selectedObjectId) deleteObject(selectedObjectId);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteObject, redo, selectedObjectId, settings, undo]);

  const handleExport = async (id: ExportId) => {
    const presentationFormats: ExportId[] = ["pdf", "svg", "png", "illustrator"];
    if (presentationFormats.includes(id) && activeMapAudit.readiness === "no-data") {
      setStatus(`Экспорт ${id.toUpperCase()} недоступен: ${activeMapAudit.summary}`);
      return;
    }
    setStatus(`Подготовка ${exportItems.find((item) => item.id === id)?.title ?? id}...`);
    try {
      update("exportFormat", id);
      if (id === "album") {
        if (!albumDocuments.length) throw new Error("Нет доступных карт для альбома");
        const album = await renderRasterPdfAlbum(albumDocuments, effectiveSettings.rasterDpi);
        downloadBytes(album, `${toFileName(project.name)}-album.pdf`, "application/pdf");
      }
      else if (id === "formiq") downloadText(JSON.stringify({ project, sheet: effectiveSettings, sheetObjects }, null, 2), `${toFileName(project.name)}.formiq`, "application/json");
      else if (id === "svg") downloadText(await SvgLayoutRenderer.render(layoutDocument), `${toFileName(effectiveSettings.title)}.svg`, "image/svg+xml;charset=utf-8");
      else if (id === "illustrator") downloadText(`%!PS-Adobe-3.0\n%%Creator: FORMIQ\n${preview.svg}\n%%EOF`, `${toFileName(effectiveSettings.title)}.ai`, "application/postscript");
      else if (id === "shapefile") downloadText(createProjectGeoJson(project), `${toFileName(project.name)}.geojson`, "application/geo+json");
      else if (id === "png" || id === "pdf") {
        // PNG and PDF are presentation deliverables: export the composed sheet,
        // not the underlying GIS layers on their own.
        const filename = toFileName(effectiveSettings.title);
        if (id === "png") downloadBytes(await PngLayoutRenderer.render(layoutDocument, { dpi: effectiveSettings.rasterDpi }), `${filename}.png`, "image/png");
        else downloadBytes(await RasterPdfLayoutRenderer.render(layoutDocument, { dpi: effectiveSettings.rasterDpi }), `${filename}.pdf`, "application/pdf");
      }
      else {
        const result = await exportEngine.exportProject(project, { format: id as ExportFormat, filename: toFileName(effectiveSettings.title), paperFormat: effectiveSettings.pageFormat, orientation: effectiveSettings.orientation, quality: "high", resolutionScale: 1 });
        downloadBytes(result.data, result.filename, result.mimeType);
      }
      completeWorkflowStage("presentation");
      setStatus("Экспорт подготовлен");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось подготовить экспорт");
    }
  };

  return (
    <main ref={editorRef} className="relative h-full overflow-hidden bg-[#F4F7FA] text-[#0F172A]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#EAF6FC_0%,transparent_42%)]" />
      <section className="relative z-10 grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_288px] grid-rows-[56px_minmax(0,1fr)_96px] gap-3 p-3 max-xl:grid-cols-[244px_minmax(0,1fr)] max-xl:grid-rows-[56px_minmax(0,1fr)_auto] max-lg:block max-lg:overflow-y-auto">
        <PresentationHeader title={effectiveSettings.title} preset={activeMapPreset.shortTitle} audit={activeMapAudit} status={status} onUndo={undo} onRedo={redo} onFullscreen={() => void toggleFullscreen()} />
        <CompactSettingsPanel settings={effectiveSettings} audit={activeMapAudit} requirement={dataRequirement} isLoadingMissingData={isLoadingMissingData} onLoadMissingData={() => void loadMissingData()} expandedPanel={expandedPanel} onExpand={setExpandedPanel} onUpdate={update} onMapPreset={applyMapPreset} onAdd={addSheetObject} projectName={project.name} />
        <section className="grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
          {selectedObject ? <ContextualObjectToolbar object={selectedObject} onChange={(patch) => updateObject(selectedObject.id, patch)} onDelete={() => deleteObject(selectedObject.id)} onDeselect={() => setSelectedObjectId(null)} /> : <div className="h-0" />}
          <div className="min-h-0 rounded-[20px] border border-white/70 bg-[#E7ECF1]/70 p-4 backdrop-blur-3xl">
            <div className="flex h-full items-center justify-center overflow-hidden rounded-[14px] bg-[#EDF1F5]/80 p-3">
              <div className="relative flex h-full max-h-full w-full min-w-0 items-center justify-center overflow-auto">
                <div data-testid="presentation-sheet" onClick={() => setSelectedObjectId(null)} className="relative shrink-0 bg-white text-[#0F172A]" style={{ width: `${Math.min(98, Math.max(50, effectiveSettings.zoom * 1.55))}%`, maxWidth: 1180, aspectRatio: `${paper.width} / ${paper.height}`, boxShadow: "0 12px 32px rgba(15,23,42,0.10)" }}>
                  <div className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: preview.svg }} />
                  <SheetObjectLayer objects={sheetObjects} selectedId={selectedObjectId} onSelect={setSelectedObjectId} onChange={updateObject} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <CompactExportPanel status={status} settings={effectiveSettings} audit={activeMapAudit} project={analysisProject} previewSvg={preview.svg} onUpdate={update} onExport={handleExport} onFullscreen={() => void toggleFullscreen()} />
        <PresentationMapStrip
          activeMapId={effectiveSettings.mapPresetId}
          activeTemplate={effectiveSettings.selectedTemplate}
          customTemplates={customTemplates.map((item) => item.name)}
          onMapPick={applyMapPreset}
          onTemplatePick={applyTemplate}
          onCreateTemplate={createTemplate}
        />
      </section>
    </main>
  );
}

function PresentationHeader({ title, preset, audit, status, onUndo, onRedo, onFullscreen }: { title: string; preset: string; audit: PresentationDataAudit; status: string; onUndo: () => void; onRedo: () => void; onFullscreen: () => void }) {
  const statusClass = audit.status === "unavailable" ? "bg-[#FEF2F2] text-[#B91C1C]" : audit.status === "partial" ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#F0FDF4] text-[#15803D]";
  return <header className="col-span-3 flex min-w-0 items-center justify-between rounded-[18px] border border-white/70 bg-white/[0.72] px-4 py-2.5 backdrop-blur-3xl max-xl:col-span-2 max-lg:mb-3"><div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#EAF6FC] text-[#229ED9]"><span className="text-sm font-black">▧</span></div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#229ED9]">Presentation · Layout Designer</p><h1 className="truncate text-[16px] font-semibold text-[#0F172A]">{title || "Новый презентационный лист"}</h1></div><span className="hidden h-6 w-px bg-[#E2E8F0] sm:block" /><span className="hidden truncate text-[12px] text-[#64748B] sm:block">{preset}</span></div><div className="flex items-center gap-1.5"><span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-semibold md:inline-flex ${statusClass}`}>{audit.statusLabel} · {audit.coveragePercent}%</span><span className="hidden max-w-36 truncate text-[10px] text-[#64748B] lg:inline" title={status}>{status}</span><button type="button" aria-label="Отменить изменение" title="Отменить (Ctrl+Z)" onClick={onUndo} className="grid h-8 w-8 place-items-center rounded-[10px] text-[#64748B] transition hover:-translate-y-0.5 hover:bg-white">↶</button><button type="button" aria-label="Повторить изменение" title="Повторить (Ctrl+Y)" onClick={onRedo} className="grid h-8 w-8 place-items-center rounded-[10px] text-[#64748B] transition hover:-translate-y-0.5 hover:bg-white">↷</button><button type="button" onClick={onFullscreen} className="hidden h-8 rounded-[10px] border border-[#D7E4EC] bg-white/60 px-2.5 text-[11px] font-semibold text-[#229ED9] transition hover:-translate-y-0.5 sm:block">На весь экран</button></div></header>;
}

function CompactSettingsPanel({ settings, audit, requirement, isLoadingMissingData, onLoadMissingData, expandedPanel, onExpand, onUpdate, onMapPreset, onAdd, projectName }: { settings: SheetSettings; audit: PresentationDataAudit; requirement: ReturnType<typeof getPresentationDataRequirement>; isLoadingMissingData: boolean; onLoadMissingData: () => void; expandedPanel: ExpandedPanel; onExpand: (panel: ExpandedPanel) => void; onUpdate: <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => void; onMapPreset: (value: PresentationMapPresetId) => void; onAdd: (type: SheetObjectType) => void; projectName: string }) {
  const toggle = (panel: ExpandedPanel) => onExpand(expandedPanel === panel ? null : panel);
  const show = (value: boolean) => value ? "Включено" : "Выключено";
  const units = settings.units === "mm" ? "мм" : "см";

  return <aside className="min-h-0 overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.68] p-3 backdrop-blur-3xl [scrollbar-width:thin] max-lg:mb-4">
    <div className="px-1 pb-3"><h2 className="text-[15px] font-semibold">Настройки листа</h2><p className="mt-1 text-[11px] text-[#64748B]">Компоновка и элементы карты</p></div>
    <PanelGroup title="Графика карты">
      <label className="grid gap-1 rounded-[12px] bg-[#F8FAFC] p-2 text-[11px] font-medium text-[#64748B]">Тип презентационной карты<select value={settings.mapPresetId} onChange={(event) => onMapPreset(event.target.value as PresentationMapPresetId)} className="h-9 rounded-[10px] border border-[#D7E4EC] bg-white px-2 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#229ED9]">{presentationMapPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.shortTitle}</option>)}</select></label>
      <div className="mt-2 rounded-[12px] border border-white/80 bg-white/50 p-2"><p className="text-[11px] font-semibold text-[#0F172A]">{getPresentationMapPreset(settings.mapPresetId).description}</p><p className="mt-1 text-[10px] leading-4 text-[#64748B]">{getPresentationMapPreset(settings.mapPresetId).method}</p></div>
      <div className={`mt-2 rounded-[14px] border p-3 ${audit.status === "unavailable" ? "border-[#FECACA] bg-[#FEF2F2]" : audit.status === "partial" ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#BBF7D0] bg-[#F0FDF4]"}`}><div className="flex items-center justify-between gap-2"><strong className="text-[10px] font-semibold text-[#0F172A]">{audit.statusLabel}</strong><span className="text-[9px] text-[#64748B]">{audit.knownCount}/{audit.totalCount || "—"} · {audit.units}</span></div><p className="mt-1 text-[9px] leading-3.5 text-[#64748B]">{audit.summary}</p>{audit.sources.length > 0 && <p className="mt-1 truncate text-[8px] uppercase tracking-[0.06em] text-[#94A3B8]">Источники: {audit.sources.join(", ")}</p>}{audit.status !== "measured" && <div className="mt-2 border-t border-black/5 pt-2"><p className="text-[9px] font-semibold text-[#0F172A]">Не хватает</p><p className="mt-1 text-[9px] leading-3.5 text-[#64748B]">{requirement.fields.join(" · ")}</p><p className="mt-1 text-[9px] text-[#64748B]">Источник: <span className="font-medium text-[#0F172A]">{requirement.source}</span></p><p className="mt-1 text-[9px] leading-3.5 text-[#64748B]">После загрузки: {requirement.unlocks.join(" · ")}</p>{requirement.canAutoLoad ? <button type="button" disabled={isLoadingMissingData} onClick={onLoadMissingData} className="mt-2 h-8 w-full rounded-[10px] bg-[#229ED9] px-2 text-[10px] font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">{isLoadingMissingData ? "Загрузка…" : "Загрузить автоматически"}</button> : <p className="mt-2 text-[9px] font-medium text-[#B45309]">Требует настройки солнечной модели.</p>}</div>}</div>
    </PanelGroup>
    <PanelGroup title="Лист и компоновка">
      <SettingsRow label="Формат листа" value={`${settings.pageFormat} ${settings.orientation === "landscape" ? "альбомный" : "книжный"}`} expanded={expandedPanel === "format"} onClick={() => toggle("format")} />
      {expandedPanel === "format" && <div className="mb-2 grid grid-cols-5 gap-1 rounded-[12px] bg-[#F8FAFC] p-1">{(["A4", "A3", "A2", "A1", "A0"] as PaperFormat[]).map((format) => <button key={format} type="button" onClick={() => onUpdate("pageFormat", format)} className={`h-8 rounded-[9px] text-[11px] font-semibold ${settings.pageFormat === format ? "bg-[#EAF6FC] text-[#229ED9]" : "text-[#64748B] hover:bg-white"}`}>{format}</button>)}</div>}
      <SettingsRow label="Ориентация" value={settings.orientation === "landscape" ? "Альбомная" : "Книжная"} expanded={expandedPanel === "orientation"} onClick={() => toggle("orientation")} />
      {expandedPanel === "orientation" && <div className="mb-2 grid grid-cols-2 gap-1 rounded-[12px] bg-[#F8FAFC] p-1"><button type="button" onClick={() => onUpdate("orientation", "landscape")} className={`h-8 rounded-[9px] text-[12px] font-semibold ${settings.orientation === "landscape" ? "bg-[#EAF6FC] text-[#229ED9]" : "text-[#64748B] hover:bg-white"}`}>▭ Альбомная</button><button type="button" onClick={() => onUpdate("orientation", "portrait")} className={`h-8 rounded-[9px] text-[12px] font-semibold ${settings.orientation === "portrait" ? "bg-[#EAF6FC] text-[#229ED9]" : "text-[#64748B] hover:bg-white"}`}>▯ Книжная</button></div>}
      <SettingsRow label="Рамка листа" value={show(settings.showFrame)} control={<Switch checked={settings.showFrame} onChange={(value) => onUpdate("showFrame", value)} />} />
      <SettingsRow label="Поля" value={`${settings.marginsMm} ${units}`} expanded={expandedPanel === "margins"} onClick={() => toggle("margins")} />
      {expandedPanel === "margins" && <RangeRow label="Поля" value={settings.marginsMm} suffix={units} min={5} max={35} onChange={(value) => onUpdate("marginsMm", value)} />}
      <SettingsRow label="Сетка" value={show(settings.showGrid)} expanded={expandedPanel === "grid"} onClick={() => toggle("grid")} control={<Switch checked={settings.showGrid} onChange={(value) => onUpdate("showGrid", value)} />} />
      {expandedPanel === "grid" && <div className="mb-2 grid gap-2 rounded-[12px] bg-[#F8FAFC] p-2">{settings.showGrid ? <RangeRow label="Шаг сетки" value={settings.gridStepMm} suffix="мм" min={5} max={30} onChange={(value) => onUpdate("gridStepMm", value)} /> : <p className="px-1 py-1 text-[11px] text-[#64748B]">Включите сетку, чтобы настроить шаг.</p>}<label className="grid gap-1 px-1 text-[11px] font-medium text-[#64748B]">Единицы<select value={settings.units} onChange={(event) => onUpdate("units", event.target.value as "mm" | "cm")} className="h-8 rounded-[9px] border border-[#E2E8F0] bg-white px-2 text-[12px] text-[#0F172A]"><option value="mm">Миллиметры</option><option value="cm">Сантиметры</option></select></label></div>}
    </PanelGroup>
    <PanelGroup title="Элементы карты">
      <SettingsRow label="Подписи" value={show(settings.showLabels)} expanded={expandedPanel === "labels"} onClick={() => toggle("labels")} control={<Switch checked={settings.showLabels} onChange={(value) => onUpdate("showLabels", value)} />} />
      {expandedPanel === "labels" && <PanelHint>Показывает ключевые показатели анализа над картой.</PanelHint>}
      <SettingsRow label="Легенда" value={show(settings.showLegend)} expanded={expandedPanel === "legend"} onClick={() => toggle("legend")} control={<Switch checked={settings.showLegend} onChange={(value) => onUpdate("showLegend", value)} />} />
      {expandedPanel === "legend" && <PanelHint>Легенда строится из активного тематического слоя анализа.</PanelHint>}
      <SettingsRow label="Масштаб" value={settings.scale} expanded={expandedPanel === "scale"} onClick={() => toggle("scale")} />
      {expandedPanel === "scale" && <PanelHint>Подбирается по границам территории с шагом 100.</PanelHint>}
      <SettingsRow label="Качество PNG" value={`${settings.rasterDpi} DPI`} expanded={expandedPanel === "resolution"} onClick={() => toggle("resolution")} />
      {expandedPanel === "resolution" && <div className="mb-2 grid grid-cols-2 gap-1 rounded-[12px] bg-[#F8FAFC] p-1">{([300, 600] as const).map((dpi) => <button key={dpi} type="button" onClick={() => onUpdate("rasterDpi", dpi)} className={`h-8 rounded-[9px] text-[11px] font-semibold ${settings.rasterDpi === dpi ? "bg-[#EAF6FC] text-[#229ED9]" : "text-[#64748B] hover:bg-white"}`}>{dpi} DPI</button>)}</div>}
      <SettingsRow label="Масштабная линейка" value={show(settings.showScaleBar)} control={<Switch checked={settings.showScaleBar} onChange={(value) => onUpdate("showScaleBar", value)} />} />
      <SettingsRow label="Северная стрелка" value={show(settings.showNorthArrow)} expanded={expandedPanel === "north"} onClick={() => toggle("north")} control={<Switch checked={settings.showNorthArrow} onChange={(value) => onUpdate("showNorthArrow", value)} />} />
      {expandedPanel === "north" && <PanelHint>Северная стрелка выводится в правом верхнем углу листа.</PanelHint>}
      <SettingsRow label="Информационный блок" value={show(settings.showInfoBlock)} control={<Switch checked={settings.showInfoBlock} onChange={(value) => onUpdate("showInfoBlock", value)} />} />
    </PanelGroup>
    <PanelGroup title="Информация о листе">
      <SettingsRow label="Название и автор" value={settings.title} expanded={expandedPanel === "info"} onClick={() => toggle("info")} />
      {expandedPanel === "info" && <div className="mb-2 grid gap-2 rounded-[12px] bg-[#F8FAFC] p-2"><Field label="Название листа" value={settings.title} onChange={(value) => onUpdate("title", value)} /><Field label="Подзаголовок" value={settings.subtitle} onChange={(value) => onUpdate("subtitle", value)} /><Field label="Автор" value={settings.author} onChange={(value) => onUpdate("author", value)} /><Field label="Дата" value={settings.date} onChange={(value) => onUpdate("date", value)} /><p className="px-1 text-[11px] text-[#64748B]">Проект: <span className="font-medium text-[#0F172A]">{projectName}</span></p></div>}
    </PanelGroup>
    <div className="relative mt-3 border-t border-[#E2E8F0] pt-3"><button type="button" onClick={() => toggle("add")} className="flex h-9 w-full items-center justify-between rounded-[12px] px-2 text-[12px] font-semibold text-[#229ED9] transition hover:-translate-y-0.5 hover:bg-[#EAF6FC]"><span>＋ Добавить элемент</span><span>⌄</span></button>{expandedPanel === "add" && <div className="mt-2 grid grid-cols-2 gap-1 rounded-[12px] border border-white/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-xl">{([ ["text", "T Текст"], ["shape", "○ Фигура"], ["line", "╱ Линия"], ["image", "▧ Изображение"] ] as Array<[SheetObjectType, string]>).map(([type, label]) => <button key={type} type="button" onClick={() => onAdd(type)} className="rounded-[9px] px-2 py-2 text-left text-[11px] font-semibold text-[#475569] hover:bg-[#EAF6FC] hover:text-[#229ED9]">{label}</button>)}</div>}</div>
  </aside>;
}

// Вариант B: панель показывается только для выбранного объекта, поэтому не дублирует
// постоянные настройки листа из левой панели и остаётся привязанной к контексту объекта.
function ContextualObjectToolbar({ object, onChange, onDelete, onDeselect }: { object: SheetObject; onChange: (patch: Partial<SheetObject>) => void; onDelete: () => void; onDeselect: () => void }) {
  const objectTypeLabel: Record<SheetObjectType, string> = { text: "Текст", shape: "Фигура", line: "Линия", image: "Изображение" };
  const nudge = (axis: "x" | "y", value: number) => onChange({ [axis]: Math.max(0, Math.min(96, object[axis] + value)) });
  return <div data-testid="object-context-toolbar" className="flex min-w-0 flex-wrap items-center gap-2 rounded-[16px] border border-white/70 bg-white/[0.78] px-3 py-2 backdrop-blur-3xl"><span className="rounded-[9px] bg-[#EAF6FC] px-2 py-1 text-[11px] font-semibold text-[#229ED9]">{objectTypeLabel[object.type]}</span><label className="min-w-[150px] flex-1"><span className="sr-only">Название элемента</span><input value={object.label} onChange={(event) => onChange({ label: event.target.value })} className="h-8 w-full rounded-[9px] border border-[#E2E8F0] bg-white/70 px-2 text-[12px] font-medium outline-none focus:border-[#229ED9]" /></label><div className="flex items-center gap-1"><IconButton label="Влево" icon="←" onClick={() => nudge("x", -1)} /><IconButton label="Вправо" icon="→" onClick={() => nudge("x", 1)} /><IconButton label="Выше" icon="↑" onClick={() => nudge("y", -1)} /><IconButton label="Ниже" icon="↓" onClick={() => nudge("y", 1)} /></div><label className="flex items-center gap-1 text-[11px] text-[#64748B]">W<input aria-label="Ширина объекта" type="number" min="3" max="80" value={Math.round(object.width)} onChange={(event) => onChange({ width: Math.max(3, Number(event.target.value)) })} className="h-8 w-12 rounded-[8px] border border-[#E2E8F0] bg-white px-1 text-center text-[11px] text-[#0F172A]" /></label><label className="flex items-center gap-1 text-[11px] text-[#64748B]">H<input aria-label="Высота объекта" type="number" min="3" max="80" value={Math.round(object.height)} onChange={(event) => onChange({ height: Math.max(3, Number(event.target.value)) })} className="h-8 w-12 rounded-[8px] border border-[#E2E8F0] bg-white px-1 text-center text-[11px] text-[#0F172A]" /></label><button type="button" aria-label="Удалить элемент" onClick={onDelete} className="h-8 rounded-[9px] px-2 text-[12px] font-semibold text-[#EF4444] transition hover:bg-[#FEF2F2]">Удалить</button><button type="button" aria-label="Закрыть контекстную панель" onClick={onDeselect} className="h-8 w-8 rounded-[9px] text-[#64748B] hover:bg-white">×</button></div>;
}

function SheetObjectLayer({ objects, selectedId, onSelect, onChange }: { objects: SheetObject[]; selectedId: string | null; onSelect: (id: string | null) => void; onChange: (id: string, patch: Partial<SheetObject>) => void }) {
  const gestureRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; width: number; height: number } | null>(null);
  const start = (event: PointerEvent<HTMLElement>, object: SheetObject) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); gestureRef.current = { id: object.id, mode: "move", startX: event.clientX, startY: event.clientY, originX: object.x, originY: object.y, width: object.width, height: object.height }; onSelect(object.id); };
  const startResize = (event: PointerEvent<HTMLSpanElement>, object: SheetObject) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); gestureRef.current = { id: object.id, mode: "resize", startX: event.clientX, startY: event.clientY, originX: object.x, originY: object.y, width: object.width, height: object.height }; };
  const move = (event: PointerEvent<HTMLButtonElement>) => { const gesture = gestureRef.current; const sheet = event.currentTarget.parentElement; if (!gesture || !sheet) return; const bounds = sheet.getBoundingClientRect(); const dx = ((event.clientX - gesture.startX) / bounds.width) * 100; const dy = ((event.clientY - gesture.startY) / bounds.height) * 100; if (gesture.mode === "resize") onChange(gesture.id, { width: Math.max(3, Math.min(80, gesture.width + dx)), height: Math.max(3, Math.min(80, gesture.height + dy)) }); else onChange(gesture.id, { x: Math.max(0, Math.min(96, gesture.originX + dx)), y: Math.max(0, Math.min(96, gesture.originY + dy)) }); };
  return <div className="absolute inset-0">{objects.filter((object) => object.visible).map((object) => <button key={object.id} type="button" aria-label={`Выбрать ${object.label}`} onPointerDown={(event) => start(event, object)} onPointerMove={move} onPointerUp={() => { gestureRef.current = null; }} onClick={(event) => { event.stopPropagation(); onSelect(object.id); }} className={`absolute grid place-items-center border text-[9px] font-semibold transition ${selectedId === object.id ? "border-[#229ED9] bg-[#229ED9]/10 text-[#229ED9]" : "border-transparent bg-transparent text-transparent hover:border-[#229ED9]/60"}`} style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.width}%`, height: `${object.height}%` }}>{selectedId === object.id && <span aria-label="Изменить размер" onPointerDown={(event) => startResize(event, object)} className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm border border-white bg-[#229ED9]" />}</button>)}</div>;
}

function CompactExportPanel({ status, settings, audit, project, previewSvg, onUpdate, onExport, onFullscreen }: { status: string; settings: SheetSettings; audit: PresentationDataAudit; project: FormiqProjectData; previewSvg: string; onUpdate: <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => void; onExport: (id: ExportId) => void; onFullscreen: () => void }) {
  const visibleItems = exportItems.filter((item) => ["album", "pdf", "svg", "png", "illustrator", "dxf", "geojson"].includes(item.id));
  const objectCount = project.buildings.length + project.roads.length + project.vegetation.length + project.water.length + project.poi.length;
  return <aside className="min-w-0 overflow-y-auto max-xl:col-span-2 max-xl:grid max-xl:grid-cols-[minmax(0,1fr)_280px] max-xl:gap-4 max-lg:mt-4 max-lg:block"><section className="rounded-[20px] border border-white/70 bg-white/[0.68] p-3 backdrop-blur-3xl"><h2 className="text-[15px] font-semibold">Экспорт листа</h2><p className="mt-1 text-[11px] text-[#64748B]">Векторный PDF/SVG или PNG до {settings.rasterDpi} DPI.</p><div className="mt-3 grid gap-1">{visibleItems.map((item) => <button key={item.id} type="button" data-testid={`export-${item.id}`} aria-pressed={settings.exportFormat === item.id} onClick={() => void onExport(item.id)} className={`flex min-w-0 items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition hover:-translate-y-0.5 ${settings.exportFormat === item.id ? "bg-[#EAF6FC] text-[#229ED9]" : "hover:bg-white/80"}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-[8px] font-bold text-white" style={{ backgroundColor: item.color }}>{item.title.slice(0, 3)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{item.title}</span><span className="block truncate text-[9px] text-[#64748B]">{item.subtitle}</span></span><span className="text-[#94A3B8]">↓</span></button>)}</div><button type="button" onClick={() => void onExport("formiq")} className="mt-3 h-9 w-full rounded-[12px] border border-[#D7E4EC] bg-white/65 px-3 text-[11px] font-semibold text-[#475569] transition hover:-translate-y-0.5 hover:border-[#229ED9] hover:text-[#229ED9]">Экспортировать проект</button><p className="mt-2 text-[10px] text-[#64748B]">{status}</p></section><section className="mt-3 rounded-[20px] border border-white/70 bg-white/[0.68] p-3 backdrop-blur-3xl"><div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold">Состав листа</h3><span className="rounded-full bg-[#F0FDF4] px-2 py-1 text-[9px] font-semibold text-[#15803D]">{audit.coveragePercent}% данных</span></div><div className="mt-2 grid grid-cols-2 gap-2"><MiniStat label="Объекты" value={objectCount.toLocaleString("ru-RU")} /><MiniStat label="Здания" value={project.buildings.length.toLocaleString("ru-RU")} /><MiniStat label="Источники" value={project.dataSources.filter((source) => source.status === "active").length.toString()} /><MiniStat label="CRS" value={project.crs} /></div></section><section className="mt-3 rounded-[20px] border border-white/70 bg-white/[0.68] p-3 backdrop-blur-3xl"><div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold">Предпросмотр листа</h3><span className="text-[10px] text-[#64748B]">{settings.zoom}%</span></div><div className="pointer-events-none mt-2 overflow-hidden rounded-[10px] border border-[#CBD5E1]/70 bg-white p-1.5" dangerouslySetInnerHTML={{ __html: previewSvg }} /><div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-[10px] border border-[#E2E8F0] bg-white/70"><button type="button" aria-label="Уменьшить масштаб" onClick={() => onUpdate("zoom", Math.max(35, settings.zoom - 5))} className="h-7 w-7">−</button><span className="w-10 text-center text-[11px] font-semibold">{settings.zoom}%</span><button type="button" aria-label="Увеличить масштаб" onClick={() => onUpdate("zoom", Math.min(100, settings.zoom + 5))} className="h-7 w-7">+</button></div><button type="button" onClick={onFullscreen} className="rounded-[9px] px-2 py-1.5 text-[11px] font-semibold text-[#229ED9] hover:bg-[#EAF6FC]">⛶ На весь экран</button></div></section></aside>;
}

function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-[10px] bg-[#F8FAFC] px-2 py-1.5"><p className="text-[9px] text-[#64748B]">{label}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-[#0F172A]" title={value}>{value}</p></div>; }

function PresentationMapStrip({ activeMapId, activeTemplate, customTemplates, onMapPick, onTemplatePick, onCreateTemplate }: { activeMapId: PresentationMapPresetId; activeTemplate: string; customTemplates: string[]; onMapPick: (value: PresentationMapPresetId) => void; onTemplatePick: (value: string) => void; onCreateTemplate: () => void }) {
  const templates = ["Базовый", "Минимализм", "Классика", "Сетка", "Светлый", ...customTemplates];
  const activePreset = getPresentationMapPreset(activeMapId);

  return <section className="col-span-full flex min-w-0 items-center gap-3 overflow-hidden rounded-[20px] border border-white/70 bg-white/[0.68] px-3 py-2 backdrop-blur-3xl max-xl:row-start-3 max-lg:mt-4">
    <div className="w-[126px] shrink-0"><h3 className="text-[12px] font-semibold">Тип карты</h3><p className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-[#64748B]">{activePreset.description}</p></div>
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
      {presentationMapPresets.map((preset) => <button key={preset.id} type="button" aria-pressed={activeMapId === preset.id} onClick={() => onMapPick(preset.id)} title={`${preset.title}. ${preset.method}`} className={`flex h-14 min-w-[142px] shrink-0 items-center gap-2 rounded-[12px] border px-1.5 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${activeMapId === preset.id ? "border-[#229ED9] bg-[#EAF6FC]" : "border-white/70 bg-white/45 hover:border-[#BAE2F5]"}`}>
        <span className="grid h-10 w-[54px] shrink-0 place-items-center overflow-hidden rounded-[6px] border border-[#CBD5E1] bg-white" dangerouslySetInnerHTML={{ __html: createPresetThumbnail(preset) }} />
        <span className="min-w-0"><strong className="block line-clamp-2 text-[10px] leading-3">{preset.shortTitle}</strong><span className="mt-1 block text-[8px] uppercase tracking-[0.08em] text-[#64748B]">{preset.legendLabels.length} классов</span></span>
      </button>)}
    </div>
    <div className="flex shrink-0 items-center gap-1.5 border-l border-[#E2E8F0] pl-3">
      <label className="grid gap-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[#64748B]">Лист<select aria-label="Шаблон листа" value={activeTemplate} onChange={(event) => onTemplatePick(event.target.value)} className="h-8 w-[112px] rounded-[9px] border border-[#E2E8F0] bg-white/75 px-2 text-[10px] normal-case tracking-normal text-[#0F172A] outline-none focus:border-[#229ED9]">{templates.map((template) => <option key={template}>{template}</option>)}</select></label>
      <button type="button" aria-label="Сохранить текущий шаблон листа" onClick={onCreateTemplate} className="mt-3 grid h-8 w-8 place-items-center rounded-[9px] border border-dashed border-[#CBD5E1] text-[#64748B] transition hover:-translate-y-0.5 hover:border-[#229ED9] hover:text-[#229ED9]">＋</button>
    </div>
  </section>;
}

function createPresetThumbnail(preset: PresentationMapPreset) {
  if (preset.id === "population-grid") return `<svg viewBox="0 0 54 40" width="54" height="40"><rect width="54" height="40" fill="#F8FAFC"/><path d="M2 9 8 5l6 4v7l-6 4-6-4Zm13 0 6-4 6 4v7l-6 4-6-4Zm13 0 6-4 6 4v7l-6 4-6-4ZM8 22l6-4 6 4v7l-6 4-6-4Zm13 0 6-4 6 4v7l-6 4-6-4Zm13 0 6-4 6 4v7l-6 4-6-4Z" fill="${preset.palette[2]}" opacity=".78"/></svg>`;
  if (["transit-access", "population-heatmap", "terrain-height"].includes(preset.id)) return `<svg viewBox="0 0 54 40" width="54" height="40"><defs><radialGradient id="thumb-${preset.id}"><stop stop-color="${preset.palette.at(-1)}" stop-opacity=".9"/><stop offset="1" stop-color="${preset.palette[0]}" stop-opacity=".12"/></radialGradient></defs><rect width="54" height="40" fill="#F8FAFC"/><circle cx="18" cy="21" r="16" fill="url(#thumb-${preset.id})"/><circle cx="39" cy="15" r="12" fill="url(#thumb-${preset.id})"/></svg>`;
  if (preset.id === "axonometric-zoning") return `<svg viewBox="0 0 54 40" width="54" height="40"><rect width="54" height="40" fill="#F8FAFC"/><path d="m8 27 14-8 14 7-14 8Z" fill="${preset.palette[1]}"/><path d="m21 19 11-6 9 5-11 6Z" fill="#fff" stroke="#94A3B8"/><path d="m30 24 11-6v6l-11 6Z" fill="#CBD5E1"/></svg>`;
  if (preset.id === "shadow-analysis") return `<svg viewBox="0 0 54 40" width="54" height="40"><rect width="54" height="40" fill="#F8FAFC"/><path d="m12 14 13 4 13 15-14-5Z" fill="${preset.palette[2]}" opacity=".68"/><rect x="10" y="10" width="18" height="11" fill="#fff" stroke="#64748B"/></svg>`;
  return `<svg viewBox="0 0 54 40" width="54" height="40"><rect width="54" height="40" fill="#F8FAFC"/>${Array.from({ length: 9 }, (_, index) => `<rect x="${4 + (index % 3) * 17}" y="${5 + Math.floor(index / 3) * 11}" width="13" height="8" rx="1" fill="${preset.palette[index % preset.palette.length]}"/>`).join("")}</svg>`;
}

function PanelGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="border-t border-[#E2E8F0] py-3 first:border-t-0 first:pt-0"><h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{title}</h3>{children}</section>; }
function SettingsRow({ label, value, control, expanded = false, onClick }: { label: string; value: string; control?: ReactNode; expanded?: boolean; onClick?: () => void }) { return <div className={`flex min-h-9 items-center gap-2 rounded-[10px] px-2 transition hover:bg-white/70 ${expanded ? "bg-[#F8FAFC]" : ""}`}>{onClick ? <button type="button" aria-expanded={expanded} onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"><span className="min-w-0 flex-1 text-[12px] font-medium">{label}</span><span className="max-w-[94px] truncate text-[11px] text-[#64748B]">{value}</span><span className="text-[#94A3B8]">›</span></button> : <span className="min-w-0 flex-1 text-[12px] font-medium">{label}</span>}{control}</div>; }
function PanelHint({ children }: { children: ReactNode }) { return <p className="mb-2 rounded-[10px] bg-[#F8FAFC] px-2 py-2 text-[11px] leading-4 text-[#64748B]">{children}</p>; }

/* Removed from the active editor: the former always-visible toolbar and panel duplicated
   the compact settings panel and were replaced by the contextual object toolbar above.
function LeftEditorPanel({ settings, update, sheetObjects, setSheetObjects }: { settings: SheetSettings; update: <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => void; sheetObjects: SheetObject[]; setSheetObjects: React.Dispatch<React.SetStateAction<SheetObject[]>> }) {
  const elements: Array<{ label: string; icon: string; key: keyof SheetSettings }> = [
    { label: "Рамка листа", icon: "□", key: "showFrame" },
    { label: "Легенда", icon: "▦", key: "showLegend" },
    { label: "Масштабная линейка", icon: "⌁", key: "showScale" },
    { label: "Северная стрелка", icon: "▲", key: "showNorth" },
    { label: "Информационный блок", icon: "▣", key: "showLabels" },
  ];
  return <aside className="min-h-0 overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.68] p-4 backdrop-blur-3xl [scrollbar-width:thin] max-lg:mb-3">
    <h2 className="text-base font-semibold">Лист и компоновка</h2>
    <div className="mt-5 grid gap-4">
      <SelectRow label="Формат листа" value={settings.paper} options={["A4", "A3", "A2"]} onPick={(value) => update("paper", value as PaperFormat)} />
      <div><p className="text-[12px] font-semibold text-[#64748B]">Ориентация</p><div className="mt-2 flex gap-2"><OrientationButton active={settings.orientation === "landscape"} label="Альбомная" icon="▭" onClick={() => update("orientation", "landscape")} /><OrientationButton active={settings.orientation === "portrait"} label="Книжная" icon="▯" onClick={() => update("orientation", "portrait")} /></div></div>
      <RangeRow label="Поля" value={settings.marginMm} suffix="мм" min={5} max={35} onChange={(value) => update("marginMm", value)} />
      <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Сетка</span><Switch checked={settings.showGrid} onChange={(value) => update("showGrid", value)} /></div>
      <RangeRow label="Шаг сетки" value={settings.gridStepMm} suffix="мм" min={5} max={30} onChange={(value) => update("gridStepMm", value)} />
      <SelectRow label="Единицы" value={settings.units} options={["mm", "cm"]} onPick={(value) => update("units", value as "mm" | "cm")} />
      <div className="rounded-[12px] bg-[#EAF6FC] px-3 py-2 text-[12px]"><div className="flex justify-between font-semibold"><span>Автомасштаб</span><span className="text-[#229ED9]">{settings.scale}</span></div><p className="mt-1 text-[#64748B]">По границам территории, шаг 100</p></div>
    </div>
    <section className="mt-5 border-t border-[#E2E8F0] pt-4"><h3 className="text-[13px] font-semibold">Элементы листа</h3><div className="mt-2 grid gap-1">{elements.map((element) => <ElementRow key={String(element.key)} icon={element.icon} label={element.label} visible={Boolean(settings[element.key])} onToggle={() => update(element.key, (!settings[element.key]) as never)} />)}{sheetObjects.map((object) => <ElementRow key={object.id} icon={object.type === "text" ? "A" : object.type === "shape" ? "◇" : object.type === "line" ? "╱" : "▧"} label={object.label} visible={object.visible} onToggle={() => setSheetObjects((current) => current.map((item) => item.id === object.id ? { ...item, visible: !item.visible } : item))} />)}</div><button type="button" onClick={() => setSheetObjects((current) => [...current, { id: `text-${Date.now()}`, type: "text", label: `Текст ${current.length + 1}`, visible: true }])} className="mt-3 w-full rounded-[12px] px-3 py-2 text-left text-[13px] font-semibold text-[#229ED9] transition hover:-translate-y-0.5 hover:bg-[#EAF6FC]">＋ Добавить элемент</button></section>
  </aside>;
}

function EditorToolbar({ activeTool, onTool, zoom, setZoom, onUndo, onRedo, canUndo, canRedo, onFullscreen, isFullscreen }: { activeTool: ToolId; onTool: (tool: ToolId) => void; zoom: number; setZoom: (value: number) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; onFullscreen: () => void; isFullscreen: boolean }) {
  const tools: Array<{ id: ToolId; label: string; icon: string }> = [
    { id: "select", label: "Выбор", icon: "⌁" }, { id: "text", label: "Текст", icon: "T" }, { id: "shape", label: "Фигура", icon: "○" }, { id: "line", label: "Линия", icon: "╱" }, { id: "frame", label: "Рамка", icon: "□" }, { id: "legend", label: "Легенда", icon: "▦" }, { id: "scale", label: "Масштаб", icon: "⌇" }, { id: "north", label: "Север", icon: "▲" }, { id: "table", label: "Таблица", icon: "▤" }, { id: "image", label: "Изображение", icon: "▧" },
  ];
  return <header className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[20px] border border-white/70 bg-white/[0.68] px-2 py-1.5 backdrop-blur-3xl"><div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none]">{tools.map((tool) => <button key={tool.id} type="button" data-testid={`sheet-tool-${tool.id}`} title={tool.label} onClick={() => onTool(tool.id)} className={`flex min-w-[50px] flex-1 flex-col items-center justify-center rounded-[12px] px-1 py-1 text-[9px] font-medium transition duration-200 hover:-translate-y-0.5 ${activeTool === tool.id ? "bg-[#EAF6FC] text-[#229ED9]" : "text-[#0F172A] hover:bg-white/80"}`}><span className="text-[17px] leading-5">{tool.icon}</span><span className="max-w-[58px] truncate">{tool.label}</span></button>)}</div><div className="flex shrink-0 items-center gap-0.5"><IconButton label="Отменить" icon="↶" onClick={onUndo} disabled={!canUndo} /><IconButton label="Повторить" icon="↷" onClick={onRedo} disabled={!canRedo} /><div className="ml-1 flex h-9 items-center rounded-[12px] border border-[#E2E8F0] bg-white/70"><button type="button" aria-label="Уменьшить" onClick={() => setZoom(Math.max(30, zoom - 5))} className="h-9 w-7">−</button><span className="w-10 text-center text-[11px] font-semibold">{zoom}%</span><button type="button" aria-label="Увеличить" onClick={() => setZoom(Math.min(100, zoom + 5))} className="h-9 w-7">+</button></div><IconButton label={isFullscreen ? "Выйти из полного экрана" : "На весь экран"} icon={isFullscreen ? "×" : "⛶"} onClick={onFullscreen} /></div></header>;
}

function ExportPanel({ status, zoom, setZoom, previewSvg, onExport, onFullscreen }: { status: string; zoom: number; setZoom: (value: number) => void; previewSvg: string; onExport: (id: ExportId) => void; onFullscreen: () => void }) {
  const visibleItems = exportItems.filter((item) => ["pdf", "svg", "png", "illustrator", "dxf", "geojson"].includes(item.id));
  return <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto max-xl:col-span-2 max-xl:grid max-xl:grid-cols-2 max-lg:mt-3 max-lg:block"><section className="rounded-[20px] border border-white/70 bg-white/[0.68] p-4 backdrop-blur-3xl"><h2 className="text-base font-semibold">Экспорт листа</h2><div className="mt-3 divide-y divide-[#E2E8F0]">{visibleItems.map((item) => <button key={item.id} type="button" data-testid={`export-${item.id}`} onClick={() => void onExport(item.id)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:-translate-y-0.5"><span className="grid h-7 w-7 place-items-center rounded-[8px] text-[9px] font-bold text-white" style={{ backgroundColor: item.color }}>{item.title.slice(0, 3)}</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{item.title}</span><span className="block truncate text-[10px] text-[#64748B]">{item.subtitle}</span></span><span className="text-[#64748B]">↓</span></button>)}</div><p className="mt-3 text-[11px] text-[#64748B]">{status}</p></section><section className="rounded-[20px] border border-white/70 bg-white/[0.68] p-4 backdrop-blur-3xl"><h3 className="text-sm font-semibold">Предпросмотр</h3><div className="mt-3 overflow-hidden rounded-[12px] border border-[#CBD5E1]/70 bg-white p-2" dangerouslySetInnerHTML={{ __html: previewSvg }} /><div className="mt-3 flex items-center justify-center gap-1"><button type="button" aria-label="Уменьшить лист" onClick={() => setZoom(Math.max(30, zoom - 5))} className="h-8 w-8 rounded-[10px] hover:bg-white">−</button><span className="w-12 text-center text-[12px] font-semibold">{zoom}%</span><button type="button" aria-label="Увеличить лист" onClick={() => setZoom(Math.min(100, zoom + 5))} className="h-8 w-8 rounded-[10px] hover:bg-white">+</button></div><button type="button" onClick={onFullscreen} className="mt-3 w-full rounded-[12px] border border-[#D7E4EC] bg-white/65 px-3 py-2 text-[12px] font-semibold transition hover:-translate-y-0.5 hover:border-[#229ED9]">⛶ На весь экран</button></section></aside>;
}

function TemplateStrip({ active, customTemplates, onPick, onCreate, previewSvg }: { active: string; customTemplates: string[]; onPick: (value: string) => void; onCreate: () => void; previewSvg: string }) { const templates = ["Базовый", "Минимализм", "Классика", "Сетка", "Светлый", ...customTemplates]; return <section className="col-span-3 flex h-24 items-center gap-3 overflow-x-auto rounded-[20px] border border-white/70 bg-white/[0.68] px-4 py-3 backdrop-blur-3xl max-xl:col-span-2 max-lg:mt-3"><h3 className="mr-1 shrink-0 text-[13px] font-semibold">Шаблоны листов</h3>{templates.map((item) => <button key={item} type="button" onClick={() => onPick(item)} className={`flex h-16 min-w-[170px] items-center gap-3 rounded-[14px] border px-2 text-left transition hover:-translate-y-0.5 ${active === item ? "border-[#229ED9] bg-[#EAF6FC]" : "border-white/70 bg-white/45"}`}><span className="h-12 w-[68px] overflow-hidden rounded-[6px] border border-[#CBD5E1] bg-white" dangerouslySetInnerHTML={{ __html: previewSvg }} /><span><strong className="block text-[12px]">{item}</strong><span className="text-[10px] text-[#64748B]">Альбомный</span></span></button>)}<button type="button" onClick={onCreate} className="h-16 min-w-[180px] rounded-[14px] border border-dashed border-[#CBD5E1] text-[12px] font-semibold text-[#64748B] transition hover:-translate-y-0.5 hover:border-[#229ED9] hover:text-[#229ED9]">＋ Создать шаблон</button></section>; }

function OrientationButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) { return <button type="button" aria-label={label} onClick={onClick} className={`grid h-9 w-14 place-items-center rounded-[10px] border text-base transition hover:-translate-y-0.5 ${active ? "border-[#229ED9] bg-[#EAF6FC] text-[#229ED9]" : "border-[#E2E8F0] bg-white/60"}`}>{icon}</button>; }
*/
function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-[#229ED9]" : "bg-[#CBD5E1]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} /></button>; }
function IconButton({ label, icon, onClick, disabled = false }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-[10px] text-lg transition hover:-translate-y-0.5 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-30">{icon}</button>; }
function RangeRow({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) { return <label className="grid gap-1 rounded-[12px] bg-white/[0.45] px-3 py-2 text-[12px] font-semibold"><span className="flex justify-between"><span>{label}</span><span className="text-[#64748B]">{value} {suffix}</span></span><input type="range" min={min} max={max} value={value} className="h-2 accent-[#229ED9]" onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-[12px] font-medium text-[#64748B]">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-[10px] border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0F172A] outline-none focus:border-[#229ED9]" /></label>; }

function buildSheetPreview(project: FormiqProjectData, analysisProject: FormiqProjectData, settings: SheetSettings, preset: PresentationMapPreset, audit: PresentationDataAudit, requirement: ReturnType<typeof getPresentationDataRequirement>, thematicMap: ThematicMapDefinition | null, analysisModel: ReturnType<typeof buildAnalysisModel>, projection: ReturnType<typeof projectScenario>, sheetObjects: SheetObject[]) {
  const paper = getPaper(settings.pageFormat, settings.orientation);
  const { width, height, margin, mapBox } = getSheetLayout(paper, settings.marginsMm);
  const mapLayers = createTerritoryMap(project, mapBox, thematicMap, preset, audit, requirement);
  const grid = settings.showGrid ? createGrid(width, height, margin, settings.gridStepMm, paper.width) : "";
  const legend = settings.showLegend ? createPresentationLegend(width - margin - 200, margin + 250, preset, project, audit) : "";
  const north = settings.showNorthArrow ? createNorthArrow(width - margin - 70, margin + 48) : "";
  const scale = settings.showScaleBar ? createScaleBar(margin + 40, height - margin - 88, settings.scale, paper.width, width) : "";
  const frame = settings.showFrame ? `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#0F172A" stroke-width="1.2"/>` : "";
  const labels = settings.showInfoBlock ? createTitleBlock(width - margin - 320, height - margin - 176, settings, analysisProject) : "";
  const metrics = settings.showLabels ? createMetricStrip(margin + 44, margin + 126, mapBox.width, audit) : "";
  const customObjects = createSheetObjects(sheetObjects, width, height);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="Лист презентационной карты FORMIQ"><rect width="${width}" height="${height}" fill="#fff"/>${grid}<rect x="${margin + 14}" y="${margin + 14}" width="${width - margin * 2 - 28}" height="${height - margin * 2 - 28}" fill="none" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="5 5"/>${frame}<text x="${margin + 44}" y="${margin + 60}" font-family="Inter,Arial" font-size="28" font-weight="600" fill="#0F172A">${escapeXml(settings.title.toUpperCase())}</text><text x="${margin + 44}" y="${margin + 88}" font-family="Inter,Arial" font-size="13" fill="#64748B">${escapeXml(settings.subtitle)} · ${escapeXml(preset.description)}</text><text x="${margin + 44}" y="${margin + 108}" font-family="Inter,Arial" font-size="10" font-weight="600" fill="${audit.status === "unavailable" ? "#B91C1C" : audit.status === "partial" ? "#B45309" : "#15803D"}">${escapeXml(audit.statusLabel.toUpperCase())} · ${audit.coveragePercent}% · ${escapeXml(audit.sources.join(", ") || "источник отсутствует")}</text>${metrics}${mapLayers}${customObjects}${legend}${north}${scale}${labels}</svg>`,
  };
}

function createLayoutDocumentForPreview(project: FormiqProjectData, settings: SheetSettings, preset: PresentationMapPreset, audit: PresentationDataAudit, svgMarkup: string, sheetObjects: SheetObject[], sourceCrs: string, displayCrs: string) {
  const paper = getPaper(settings.pageFormat, settings.orientation);
  const layout = getSheetLayout(paper, settings.marginsMm);
  return buildLayoutDocument({
    previewZoom: settings.zoom,
    rasterDpi: settings.rasterDpi,
    page: createPageDefinition(settings.pageFormat, settings.orientation, settings.marginsMm),
    map: {
      x: layout.mapBox.x,
      y: layout.mapBox.y,
      width: layout.mapBox.width,
      height: layout.mapBox.height,
      bounds: getExportBounds(project),
      scaleDenominator: Number(settings.scale.replace("1:", "")) || 0,
      sourceCrs,
      displayCrs,
      thematicMapId: preset.id,
    },
    elements: sheetObjects,
    metadata: {
      title: settings.title,
      subtitle: settings.subtitle,
      author: settings.author,
      date: settings.date,
      projectId: project.id,
      projectName: project.name,
      sourceCrs,
      displayCrs,
      provenance: audit.sources,
    },
    readiness: {
      state: audit.readiness,
      coveragePercent: audit.coveragePercent,
      knownCount: audit.knownCount,
      totalCount: audit.totalCount,
      summary: audit.summary,
    },
    svgMarkup,
  });
}
function getPaper(format: PaperFormat, orientation: Orientation) { const size = paperSizes[format]; return orientation === "landscape" ? size : { width: size.height, height: size.width }; }
function getSheetLayout(paper: { width: number; height: number }, marginMm: number) {
  // Keep annotation geometry in a fixed physical design size (A3 = 1120
  // logical units) while allowing the map frame to grow with larger paper.
  const width = Math.round(sheetWidth * (paper.width / paperSizes.A3.width));
  const height = Math.round(width * (paper.height / paper.width));
  const margin = Math.round((marginMm / paper.width) * width);
  return {
    width,
    height,
    margin,
    mapBox: {
      x: margin + 26,
      y: margin + 158,
      width: width - margin * 2 - 260,
      height: height - margin * 2 - 264,
    },
  };
}

function createTerritoryMap(project: FormiqProjectData, box: { x: number; y: number; width: number; height: number }, thematicMap: ThematicMapDefinition | null, preset: PresentationMapPreset, audit: PresentationDataAudit, requirement: ReturnType<typeof getPresentationDataRequirement>) {
  const entities: FormiqEntity[] = [...project.buildings, ...project.vegetation, ...project.water, ...project.roads];
  const territory = project.territories.find((item) => item.id === project.activeTerritoryId) ?? project.territories.find((item) => item.isActive) ?? null;
  const rawBounds = territory?.bounds ?? project.metadata.bounds ?? getEntityBounds(entities);

  if (!rawBounds || !territory) {
    return createNoDataMapMessage(box, "Не задана активная территория или её географические границы.", requirement);
  }

  const bounds = expandPreviewBounds(unionBounds(rawBounds, getEntityBounds(entities)), mapContextPaddingRatio);
  const territoryPath = territoryGeometryToSvgPath(territory, bounds, box);
  const thematicColors = new Map((thematicMap?.geojson.features ?? []).map((feature) => [String(feature.id ?? feature.properties?.id), String(feature.properties?.renderColor ?? "#94A3B8")]));
  const context = entities.map((entity) => createEntityPath(entity, bounds, box, getContextEntityColor(entity), false)).join("");
  const thematic = audit.status === "unavailable" ? createNoDataMapMessage(box, audit.summary, requirement) : createPresentationMapLayer(project, preset, bounds, box, thematicColors);
  const boundaryColor = preset.id === "terrain-height" ? "#FFFFFF" : "#334155";

  return `<g><defs><clipPath id="formiq-map-clip"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></clipPath><clipPath id="formiq-territory-clip"><path d="${territoryPath}" fill-rule="evenodd"/></clipPath></defs><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#FFFFFF"/><g clip-path="url(#formiq-map-clip)"><g opacity="${preset.id === "terrain-height" ? ".18" : ".68"}">${context}</g><g clip-path="url(#formiq-territory-clip)">${thematic}</g></g><path d="${territoryPath}" fill="none" stroke="${boundaryColor}" stroke-width="1.5" stroke-dasharray="7 5" stroke-linejoin="round"/></g>`;
}

function createEntityPath(entity: FormiqEntity, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }, color: string, thematic: boolean) {
  const path = geometryToSvgPath(entity.geometry, bounds, box);
  if (!path) return "";
  if (entity.type === "road") {
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${thematic ? 1.35 : 1.1}" opacity="${thematic ? ".9" : ".72"}"/>`;
  }
  return `<path d="${path}" fill="${color}" stroke="#FFFFFF" stroke-width="${thematic ? .8 : .55}" opacity="${thematic ? ".96" : ".9"}"/>`;
}

function createPresentationMapLayer(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }, thematicColors: Map<string, string>) {
  if (preset.id === "population-grid") return createPopulationGrid(project, preset, bounds, box);
  if (preset.id === "transit-access") return createTransitAccessibility(project, preset, bounds, box);
  if (preset.id === "population-heatmap") return createPopulationHeatmap(project, preset, bounds, box);
  if (preset.id === "terrain-height") return createTerrainPresentation(project, preset, bounds, box);
  if (preset.id === "axonometric-zoning") return createAxonometricPresentation(project, preset, bounds, box);

  return project.buildings
    .map((building) => createEntityPath(building, bounds, box, getPresetBuildingColor(building, preset, thematicColors), true))
    .join("");
}

function createPopulationGrid(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const radius = Math.max(7, metersToPixels(500, bounds, box));
  const rowStep = Math.sqrt(3) * radius;
  const centers = project.buildings.flatMap((building) => {
    const population = getBuildingPopulation(building);
    return population === null ? [] : [{ point: projectPoint(getGeometryCenter(building.geometry), bounds, box), population }];
  });
  const cells: string[] = [];

  for (let column = -1; column < Math.ceil(box.width / (radius * 1.5)) + 1; column += 1) {
    for (let row = -1; row < Math.ceil(box.height / rowStep) + 1; row += 1) {
      const x = box.x + column * radius * 1.5;
      const y = box.y + row * rowStep + (column % 2 === 0 ? 0 : rowStep / 2);
      const population = centers.reduce((sum, center) => {
        const distance = Math.hypot(center.point[0] - x, center.point[1] - y);
        return distance < radius ? sum + center.population : sum;
      }, 0);
      if (population === 0) continue;
      const colorIndex = population <= 50 ? 1 : population <= 100 ? 2 : population <= 150 ? 3 : 4;
      const color = preset.palette[colorIndex];
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = (Math.PI / 180) * (60 * index);
        return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
      }).join(" ");
      cells.push(`<polygon points="${points}" fill="${color}" fill-opacity=".82" stroke="#FFFFFF" stroke-width=".7"><title>${Math.round(population)} чел.</title></polygon>`);
    }
  }

  return cells.join("");
}

function createPopulationHeatmap(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const bins = aggregatePopulationBins(project, bounds, box);
  const maxPopulation = Math.max(...bins.map((bin) => bin.population), 1);
  const spots = bins.map((bin) => {
    const ratio = bin.population / maxPopulation;
    const color = preset.palette[Math.min(preset.palette.length - 1, Math.max(1, Math.ceil(ratio * (preset.palette.length - 1))))];
    const radius = 28 + ratio * 58;
    return `<circle cx="${bin.x}" cy="${bin.y}" r="${radius}" fill="${color}" fill-opacity="${(.2 + ratio * .58).toFixed(2)}"><title>${Math.round(bin.population)} чел.</title></circle>`;
  }).join("");
  return `<g style="mix-blend-mode:multiply" filter="url(#population-blur)"><defs><filter id="population-blur"><feGaussianBlur stdDeviation="14"/></filter></defs>${spots}</g>`;
}

function createTransitAccessibility(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const points = project.transitStops.map((entity) => projectPoint(entity.geometry.coordinates, bounds, box));
  const accessRadius = metersToPixels(300, bounds, box);
  const stopColor = preset.palette.at(-1) ?? "#B84A36";
  const fields = points.map((_, index) => `<radialGradient id="access-${index}"><stop stop-color="${preset.palette[2]}" stop-opacity=".62"/><stop offset=".62" stop-color="${preset.palette[1]}" stop-opacity=".42"/><stop offset="1" stop-color="${preset.palette[0]}" stop-opacity="0"/></radialGradient>`).join("");
  const zones = points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="${accessRadius}" fill="url(#access-${index})" stroke="${stopColor}" stroke-width=".8" stroke-opacity=".5"><title>Радиусная доступность 300 м</title></circle>`).join("");
  const stops = points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${stopColor}" stroke="#FFFFFF" stroke-width="1.1"/>`).join("");
  return `<defs>${fields}</defs><g style="mix-blend-mode:multiply">${zones}</g>${stops}`;
}

function createTerrainPresentation(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const terrainPoints = project.terrain.filter((terrain) => typeof terrain.elevation === "number" && Number.isFinite(terrain.elevation));
  const elevations = terrainPoints.map((terrain) => terrain.elevation as number);
  const minimum = Math.min(...elevations);
  const maximum = Math.max(...elevations);
  const range = Math.max(maximum - minimum, 1);
  const spots = terrainPoints.map((terrain, index) => {
    const [x, y] = projectPoint(getGeometryCenter(terrain.geometry), bounds, box);
    const ratio = ((terrain.elevation as number) - minimum) / range;
    const color = preset.palette[Math.min(preset.palette.length - 1, Math.round(ratio * (preset.palette.length - 1)))];
    const radius = Math.max(24, metersToPixels(90, bounds, box));
    return `<radialGradient id="terrain-${index}"><stop stop-color="${color}" stop-opacity=".88"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><circle cx="${x}" cy="${y}" r="${radius}" fill="url(#terrain-${index})"><title>${formatNumber(terrain.elevation as number)} м</title></circle>`;
  }).join("");
  return `<g style="mix-blend-mode:multiply">${spots}</g>`;
}

function createAxonometricPresentation(project: FormiqProjectData, preset: PresentationMapPreset, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const zones = [...project.vegetation, ...project.water].map((entity, index) => createEntityPath(entity, bounds, box, preset.palette[(index + 1) % 3], true)).join("");
  const buildings = project.buildings.map((building) => {
    const path = geometryToSvgPath(building.geometry, bounds, box);
    const known = hasKnownBuildingHeight(building);
    const heightMeters = building.relativeHeight ?? building.height ?? (building.levels ? building.levels * 3.2 : 0);
    const height = known ? Math.min(17, Math.max(2, heightMeters * .45)) : 0;
    return height === 0 ? `<path d="${path}" fill="#E5E7EB" stroke="#94A3B8" stroke-width=".6"/>` : `<path d="${path}" fill="#9CA3AF" opacity=".42" transform="translate(0 ${height})"/><path d="${path}" fill="#FFFFFF" stroke="#64748B" stroke-width=".7" transform="translate(0 -${height})"/><path d="${path}" fill="none" stroke="#CBD5E1" stroke-width="${height * .45}" stroke-linejoin="round" opacity=".7"/>`;
  }).join("");
  return `${zones}${buildings}`;
}

function getPresetBuildingColor(building: FormiqProjectData["buildings"][number], preset: PresentationMapPreset, thematicColors: Map<string, string>) {
  if (preset.id === "building-floors") {
    const categoryIndex: Record<string, number> = { low: 0, mid: 1, high: 2, "very-high": 3 };
    const category = building.semantic.heightCategory;
    if (category in categoryIndex) return preset.palette[Math.min(preset.palette.length - 1, categoryIndex[category])];
    if (!building.levels || building.levels <= 0) return "#D1D5DB";
    return preset.palette[Math.min(preset.palette.length - 1, Math.round(building.levels) - 1)];
  }
  if (preset.id === "building-age") {
    const categoryIndex: Record<string, number> = { "historic-pre-1917": 0, "soviet-early": 1, "soviet-mid": 2, "soviet-late": 3, "post-soviet": 4, contemporary: 5 };
    if (building.semantic.ageCategory in categoryIndex) return preset.palette[categoryIndex[building.semantic.ageCategory]];
    if (!building.year || building.year < 1000) return "#D1D5DB";
    const year = building.year;
    const index = year < 1800 ? 0 : year < 1920 ? 1 : year < 1960 ? 2 : year < 1990 ? 3 : year < 2020 ? 4 : 5;
    return preset.palette[index];
  }
  if (preset.id === "functional-zoning") {
    const categories = ["public", "commercial", "religious", "industrial", "education", "residential", "mixed"];
    const index = categories.indexOf(building.semantic.functionCategory);
    if (index < 0) return "#D1D5DB";
    return preset.palette[index % preset.palette.length];
  }
  return getThematicEntityColor(building, thematicColors);
}

function getGeometryCenter(geometry: FormiqGeometry): [number, number] {
  const positions = getPositions(geometry);
  if (positions.length === 0) return [0, 0];
  return [
    positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
    positions.reduce((sum, position) => sum + position[1], 0) / positions.length,
  ];
}

function aggregatePopulationBins(project: FormiqProjectData, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  const binSize = 24;
  const bins = new Map<string, { x: number; y: number; population: number }>();
  for (const building of project.buildings) {
    const population = getBuildingPopulation(building);
    if (population === null) continue;
    const [x, y] = projectPoint(getGeometryCenter(building.geometry), bounds, box);
    const column = Math.floor((x - box.x) / binSize);
    const row = Math.floor((y - box.y) / binSize);
    const key = `${column}:${row}`;
    const current = bins.get(key) ?? { x: box.x + column * binSize + binSize / 2, y: box.y + row * binSize + binSize / 2, population: 0 };
    current.population += population;
    bins.set(key, current);
  }
  return Array.from(bins.values());
}

function metersToPixels(distanceMeters: number, bounds: BoundingBox, box: { width: number; height: number }): number {
  const latitude = (bounds.north + bounds.south) / 2;
  const widthMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const heightMeters = Math.max((bounds.north - bounds.south) * 110540, 1);
  return distanceMeters * Math.min(box.width / widthMeters, box.height / heightMeters);
}

function createNoDataMapMessage(box: { x: number; y: number; width: number; height: number }, message: string, requirement: ReturnType<typeof getPresentationDataRequirement>) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return `<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#F8FAFC" fill-opacity=".82"/><rect x="${x - 176}" y="${y - 82}" width="352" height="164" rx="14" fill="#FFFFFF" fill-opacity=".92" stroke="#FDE68A"/><circle cx="${x - 144}" cy="${y - 45}" r="16" fill="#FFFBEB" stroke="#F59E0B"/><text x="${x - 144}" y="${y - 39}" text-anchor="middle" font-family="Inter,Arial" font-size="18" font-weight="700" fill="#B45309">!</text><text x="${x - 118}" y="${y - 40}" font-family="Inter,Arial" font-size="13" font-weight="700" fill="#0F172A">ДАННЫЕ НУЖНЫ ДЛЯ КАРТЫ</text><text x="${x - 118}" y="${y - 18}" font-family="Inter,Arial" font-size="10" fill="#64748B">${escapeXml(message.slice(0, 100))}</text><text x="${x - 118}" y="${y + 10}" font-family="Inter,Arial" font-size="10" font-weight="600" fill="#0F172A">Поля: ${escapeXml(requirement.fields.join(" · "))}</text><text x="${x - 118}" y="${y + 30}" font-family="Inter,Arial" font-size="10" fill="#64748B">Источник: ${escapeXml(requirement.source)}</text><text x="${x - 118}" y="${y + 52}" font-family="Inter,Arial" font-size="9" fill="#64748B">После загрузки откроются: ${escapeXml(requirement.unlocks.slice(0, 2).join(" · "))}</text></g>`;
}

function territoryGeometryToSvgPath(territory: FormiqTerritory, bounds: BoundingBox, box: { x: number; y: number; width: number; height: number }) {
  return territory.geometry.geometry.coordinates
    .map((ring) => positionsToPath(ring, bounds, box, true))
    .join(" ");
}
function createMetricStrip(x: number, y: number, width: number, audit: PresentationDataAudit) { const items = [["Объектов с данными", audit.knownCount.toLocaleString("ru-RU")], ["Всего объектов", audit.totalCount.toLocaleString("ru-RU")], ["Покрытие", `${audit.coveragePercent}%`], ["Единицы", audit.units], ["Статус", audit.statusLabel]]; const itemWidth = Math.max(88, Math.floor(width / items.length)); return `<g>${items.map(([label, value], index) => { const itemX = x + index * itemWidth; return `<g><text x="${itemX}" y="${y}" font-family="Inter,Arial" font-size="10" fill="#64748B">${escapeXml(label)}</text><text x="${itemX}" y="${y + 18}" font-family="Inter,Arial" font-size="${index === items.length - 1 ? 11 : 16}" font-weight="700" fill="#0F172A">${escapeXml(value)}</text></g>`; }).join("")}</g>`; }
function geometryToSvgPath(geometry: FormiqGeometry, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }) { if (geometry.type === "point") { const point = projectPoint(geometry.coordinates, bounds, box); return `M${point[0] - 3} ${point[1]} a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0`; } if (geometry.type === "line") return positionsToPath(geometry.coordinates, bounds, box, false); return geometry.rings.map((ring) => positionsToPath(ring, bounds, box, true)).join(" "); }
function positionsToPath(positions: Array<[number, number] | number[]>, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }, closed: boolean) { const points = positions.map((position) => projectPoint(position, bounds, box)); if (!points.length) return ""; return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point[0]} ${point[1]}`).join(" ")}${closed ? " Z" : ""}`; }
function projectPoint(position: Array<number>, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }): [number, number] { const longitudeMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos(((bounds.north + bounds.south) / 2 * Math.PI) / 180), 1); const latitudeMeters = Math.max((bounds.north - bounds.south) * 110540, 1); const scale = Math.min(box.width / longitudeMeters, box.height / latitudeMeters); const renderedWidth = longitudeMeters * scale; const renderedHeight = latitudeMeters * scale; const offsetX = box.x + (box.width - renderedWidth) / 2; const offsetY = box.y + (box.height - renderedHeight) / 2; return [Math.round(offsetX + ((position[0] - bounds.west) * 111320 * Math.cos(((bounds.north + bounds.south) / 2 * Math.PI) / 180)) * scale), Math.round(offsetY + (1 - ((position[1] - bounds.south) * 110540) / latitudeMeters) * renderedHeight)]; }
function getEntityBounds(entities: FormiqEntity[]) { const positions = entities.flatMap((entity) => getPositions(entity.geometry)); if (!positions.length) return null; return { west: Math.min(...positions.map((point) => point[0])), south: Math.min(...positions.map((point) => point[1])), east: Math.max(...positions.map((point) => point[0])), north: Math.max(...positions.map((point) => point[1])) }; }
function estimateBoundsArea(bounds: BoundingBox): number { const latitudeMeters = Math.max((bounds.north - bounds.south) * 110540, 0); const longitudeMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos(((bounds.north + bounds.south) / 2 * Math.PI) / 180), 0); return latitudeMeters * longitudeMeters; }
function getPositions(geometry: FormiqGeometry): Array<[number, number]> { if (geometry.type === "point") return [[geometry.coordinates[0], geometry.coordinates[1]]]; if (geometry.type === "line") return geometry.coordinates.map((point) => [point[0], point[1]]); return geometry.rings.flat().map((point) => [point[0], point[1]]); }
function expandPreviewBounds(bounds: BoundingBox, ratio: number): BoundingBox {
  const longitudePadding = Math.max((bounds.east - bounds.west) * ratio, 0.00001);
  const latitudePadding = Math.max((bounds.north - bounds.south) * ratio, 0.00001);
  return {
    west: bounds.west - longitudePadding,
    south: bounds.south - latitudePadding,
    east: bounds.east + longitudePadding,
    north: bounds.north + latitudePadding,
  };
}

function unionBounds(left: BoundingBox, right: BoundingBox | null): BoundingBox {
  if (!right) return left;
  return {
    west: Math.min(left.west, right.west),
    south: Math.min(left.south, right.south),
    east: Math.max(left.east, right.east),
    north: Math.max(left.north, right.north),
  };
}

function getContextEntityColor(entity: FormiqEntity) {
  if (entity.type === "vegetation") return "#E5EBD9";
  if (entity.type === "water") return "#D9EEF2";
  if (entity.type === "road") return "#C9D1DA";
  return "#BFC3C7";
}

function getThematicEntityColor(entity: FormiqEntity, thematicColors: Map<string, string>) {
  const thematicColor = thematicColors.get(entity.id);
  if (thematicColor) return thematicColor;
  if (entity.type === "vegetation") return "#C7DFA8";
  if (entity.type === "water") return "#BFE7F1";
  if (entity.type === "road") return "#D5DCE4";
  return "#9CA3AF";
}

function createSheetObjects(objects: SheetObject[], width: number, height: number) {
  return objects.filter((object) => object.visible).map((object) => {
    const x = (object.x / 100) * width;
    const y = (object.y / 100) * height;
    const objectWidth = Math.max(24, (object.width / 100) * width);
    const objectHeight = Math.max(18, (object.height / 100) * height);
    if (object.type === "text") return `<text x="${x}" y="${y + objectHeight * .7}" font-family="Inter,Arial" font-size="14" font-weight="600" fill="#0F172A">${escapeXml(object.label)}</text>`;
    if (object.type === "shape") return `<rect x="${x}" y="${y}" width="${objectWidth}" height="${objectHeight}" rx="6" fill="rgba(34,158,217,.12)" stroke="#229ED9" stroke-width="1.2"/>`;
    if (object.type === "line") return `<path d="M${x} ${y + objectHeight / 2} H${x + objectWidth}" stroke="#229ED9" stroke-width="2"/>`;
    return `<g><rect x="${x}" y="${y}" width="${objectWidth}" height="${objectHeight}" rx="5" fill="#F8FAFC" stroke="#94A3B8" stroke-dasharray="4 3"/><text x="${x + objectWidth / 2}" y="${y + objectHeight / 2 + 3}" font-family="Inter,Arial" font-size="9" text-anchor="middle" fill="#64748B">ИЗОБРАЖЕНИЕ</text></g>`;
  }).join("");
}

function createGrid(width: number, height: number, margin: number, stepMm: number, paperWidthMm: number) {
  const step = Math.max(8, (stepMm / paperWidthMm) * width);
  const vertical = Array.from({ length: Math.floor((width - margin * 2) / step) + 1 }, (_, index) => {
    const x = margin + index * step;
    return `<path d="M${x} ${margin} V${height - margin}" stroke="#E2E8F0" stroke-width=".7"/>`;
  }).join("");
  const horizontal = Array.from({ length: Math.floor((height - margin * 2) / step) + 1 }, (_, index) => {
    const y = margin + index * step;
    return `<path d="M${margin} ${y} H${width - margin}" stroke="#E2E8F0" stroke-width=".7"/>`;
  }).join("");
  return `<g opacity=".55">${vertical}${horizontal}</g>`;
}
function createPresentationLegend(x: number, y: number, preset: PresentationMapPreset, project: FormiqProjectData, audit: PresentationDataAudit) {
  const items = getPresentationLegendItems(preset, project, audit);
  const height = 70 + items.length * 22;
  return `<g><rect x="${x}" y="${y}" width="190" height="${height}" rx="8" fill="#FFFFFF" fill-opacity=".96" stroke="#CBD5E1"/><text x="${x + 12}" y="${y + 22}" font-family="Inter,Arial" font-size="11" font-weight="700" fill="#0F172A">${escapeXml(preset.legendTitle.toUpperCase())}</text><text x="${x + 12}" y="${y + 37}" font-family="Inter,Arial" font-size="8.5" fill="#64748B">${audit.coveragePercent}% покрытия · ${escapeXml(audit.units)}</text>${items.map(([color, label], index) => `<rect x="${x + 12}" y="${y + 49 + index * 22}" width="18" height="11" rx="2" fill="${color}"/><text x="${x + 40}" y="${y + 58 + index * 22}" font-family="Inter,Arial" font-size="9.5" fill="#334155">${escapeXml(label)}</text>`).join("")}</g>`;
}

function getPresentationLegendItems(preset: PresentationMapPreset, project: FormiqProjectData, audit: PresentationDataAudit): Array<readonly [string, string]> {
  if (audit.status === "unavailable") return [["#D1D5DB", "Нет достоверных данных"]];
  if (preset.id === "population-heatmap") {
    const values = project.buildings.map(getBuildingPopulation).filter((value): value is number => value !== null);
    const maximum = Math.max(...values, 1);
    return preset.palette.map((color, index) => [color, index === 0 ? "0" : `до ${Math.round(maximum * index / (preset.palette.length - 1))} чел.`]);
  }
  if (preset.id === "terrain-height") {
    const values = project.terrain.map((terrain) => terrain.elevation).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return preset.palette.map((color, index) => [color, `${formatNumber(minimum + (maximum - minimum) * index / (preset.palette.length - 1))} м`]);
  }
  const items: Array<readonly [string, string]> = preset.legendLabels.map((label, index) => [preset.palette[Math.min(index, preset.palette.length - 1)], label]);
  if (["building-floors", "building-age", "functional-zoning", "axonometric-zoning"].includes(preset.id) && audit.coveragePercent < 100) items.push(["#D1D5DB", "Нет данных"]);
  return items;
}
function createNorthArrow(x: number, y: number) { return `<g><text x="${x + 17}" y="${y}" font-family="Inter,Arial" font-size="24" font-weight="700" text-anchor="middle">N</text><path d="M${x + 17} ${y + 12} L${x} ${y + 78} L${x + 17} ${y + 64} L${x + 34} ${y + 78} Z" fill="#0F172A"/></g>`; }
function createScaleBar(x: number, y: number, scale: string, paperWidthMm: number, svgWidth: number) {
  const denominator = Math.max(100, Number(scale.replace("1:", "")) || 100);
  const targetSegmentMeters = (denominator * 30) / 1000;
  const segmentMeters = getNiceScaleDistance(targetSegmentMeters);
  const pixelsPerMm = svgWidth / paperWidthMm;
  const segmentWidth = ((segmentMeters * 1000) / denominator) * pixelsPerMm;
  const totalMeters = segmentMeters * 2;
  return `<g><text x="${x}" y="${y - 10}" font-family="Inter,Arial" font-size="12">0</text><text x="${x + segmentWidth}" y="${y - 10}" font-family="Inter,Arial" font-size="12" text-anchor="middle">${segmentMeters}</text><text x="${x + segmentWidth * 2}" y="${y - 10}" font-family="Inter,Arial" font-size="12" text-anchor="end">${totalMeters} м</text><rect x="${x}" y="${y}" width="${segmentWidth}" height="7" fill="#0F172A"/><rect x="${x + segmentWidth}" y="${y}" width="${segmentWidth}" height="7" fill="#fff" stroke="#0F172A"/><text x="${x}" y="${y + 32}" font-family="Inter,Arial" font-size="15">Масштаб ${scale}</text></g>`;
}

function getNiceScaleDistance(targetMeters: number) {
  const options = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  return options.reduce((best, option) => Math.abs(option - targetMeters) < Math.abs(best - targetMeters) ? option : best, options[0]);
}
function createTitleBlock(x: number, y: number, settings: SheetSettings, project: FormiqProjectData) {
  const territory = project.territories.find((item) => item.id === project.activeTerritoryId) ?? project.territories.find((item) => item.isActive);
  const area = territory?.bounds ? `${formatNumber(estimateBoundsArea(territory.bounds) / 1_000_000)} км²` : "—";
  const objectCount = project.buildings.length + project.roads.length + project.vegetation.length + project.water.length + project.poi.length;
  const sources = project.dataSources.filter((source) => source.status === "active").map((source) => source.name).slice(0, 2).join(", ") || "—";
  const rows = [["Проект", project.name], ["Город / регион", project.city || "—"], ["Лист", settings.title], ["Формат", `${settings.pageFormat} · ${settings.orientation === "landscape" ? "альбомный" : "книжный"}`], ["Площадь / объекты", `${area} · ${objectCount}`], ["Источники", sources], ["Дата / автор", `${settings.date} · ${settings.author}`], ["CRS / версия", `${project.crs} · FORMIQ 1.0`]];
  const rowHeight = 21;
  const width = 320;
  const height = rows.length * rowHeight;
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>${rows.map(([label, value], index) => `<path d="M${x} ${y + rowHeight * index} H${x + width}" stroke="#CBD5E1"/><text x="${x + 10}" y="${y + 14 + rowHeight * index}" font-family="Inter,Arial" font-size="9" font-weight="600" fill="#64748B">${label}</text><text x="${x + 112}" y="${y + 14 + rowHeight * index}" font-family="Inter,Arial" font-size="9" fill="#0F172A">${escapeXml(value)}</text>`).join("")}<path d="M${x + 102} ${y} V${y + height}" stroke="#CBD5E1"/><text x="${x + width - 12}" y="${y + height - 9}" font-family="Inter,Arial" font-size="10" font-weight="700" text-anchor="end" fill="#229ED9">FORMIQ</text></g>`;
}
function createProjectGeoJson(project: FormiqProjectData) { const entities = [...project.buildings, ...project.roads, ...project.vegetation, ...project.water, ...project.boundaries, ...project.poi, ...project.transitStops, ...project.terrain]; return JSON.stringify({ type: "FeatureCollection", name: project.name, crs: { type: "name", properties: { name: project.crs || "EPSG:4326" } }, formiq: { sourceCrs: project.crs || "EPSG:4326", displayCrs: "EPSG:4326", exportCrs: project.crs || "EPSG:4326", reprojection: project.crs === "EPSG:4326" || !project.crs ? "none" : "not-applied" }, features: entities.map((entity) => ({ type: "Feature", id: entity.id, properties: { id: entity.id, type: entity.type, source: entity.source }, geometry: formiqGeometryToGeoJson(entity.geometry) })) }, null, 2); }
function formiqGeometryToGeoJson(geometry: FormiqGeometry) { if (geometry.type === "point") return { type: "Point", coordinates: geometry.coordinates }; if (geometry.type === "line") return { type: "LineString", coordinates: geometry.coordinates }; return { type: "Polygon", coordinates: geometry.rings }; }
function calculateAutomaticScale(project: FormiqProjectData, paperFormat: PaperFormat, orientation: Orientation, marginMm: number) {
  const bounds = project.territories.find((territory) => territory.id === project.activeTerritoryId)?.bounds ?? project.metadata.bounds;
  if (!bounds) return "1:2000";
  const latitude = (bounds.north + bounds.south) / 2;
  const contextFactor = 1 + mapContextPaddingRatio * 2;
  const widthMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos((latitude * Math.PI) / 180) * contextFactor, 1);
  const heightMeters = Math.max((bounds.north - bounds.south) * 110540 * contextFactor, 1);
  const paper = getPaper(paperFormat, orientation);
  const layout = getSheetLayout(paper, marginMm);
  const mapWidthMm = (layout.mapBox.width / layout.width) * paper.width;
  const mapHeightMm = (layout.mapBox.height / layout.height) * paper.height;
  const required = Math.max((widthMeters * 1000) / mapWidthMm, (heightMeters * 1000) / mapHeightMm);
  const rounded = Math.max(100, Math.ceil(required / 100) * 100);
  return `1:${rounded}`;
}
function getExportBounds(project: FormiqProjectData): BoundingBox | undefined {
  return project.territories.find((territory) => territory.id === project.activeTerritoryId)?.bounds ?? project.metadata.bounds ?? getEntityBounds([...project.buildings, ...project.roads, ...project.vegetation, ...project.water]) ?? undefined;
}
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0); }
function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character); }
function toFileName(value: string) { return value.trim().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "formiq-layout"; }
function downloadText(text: string, filename: string, mimeType: string) { downloadBytes(new TextEncoder().encode(text), filename, mimeType); }
function downloadBytes(data: Uint8Array, filename: string, mimeType: string) { const blob = new Blob([new Uint8Array(data)], { type: mimeType }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

// Legacy implementation kept temporarily for backwards-compatible local snapshots; exports use presentation/renderers.ts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function rasterizeSheet(svg: string, targetWidth = 2400): Promise<RasterSheet> {
  const viewBox = svg.match(/viewBox="0 0\s+([\d.]+)\s+([\d.]+)"/);
  const sourceWidth = Number(viewBox?.[1] ?? sheetWidth);
  const sourceHeight = Number(viewBox?.[2] ?? Math.round(sheetWidth / 1.414));
  const width = targetWidth;
  const height = Math.round(targetWidth * (sourceHeight / sourceWidth));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить лист к экспорту");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const toBlob = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Не удалось собрать файл экспорта")), type, quality);
    });
    const [png, jpeg] = await Promise.all([toBlob("image/png"), toBlob("image/jpeg", 0.96)]);
    return { width, height, png: new Uint8Array(await png.arrayBuffer()), jpeg: new Uint8Array(await jpeg.arrayBuffer()) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Legacy implementation kept temporarily for backwards-compatible local snapshots; exports use presentation/renderers.ts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createSheetPdf(raster: RasterSheet, paper: { width: number; height: number }): Uint8Array {
  const pointsPerMm = 72 / 25.4;
  const pageWidth = Number((paper.width * pointsPerMm).toFixed(2));
  const pageHeight = Number((paper.height * pointsPerMm).toFixed(2));
  const encoder = new TextEncoder();
  const text = (value: string) => encoder.encode(value);
  const join = (chunks: Uint8Array[]) => {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
    return result;
  };
  const content = text(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`);
  const objects = [
    text("<< /Type /Catalog /Pages 2 0 R >>"),
    text("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    join([text(`<< /Length ${content.length} >>\nstream\n`), content, text("\nendstream")]),
    join([text(`<< /Type /XObject /Subtype /Image /Width ${raster.width} /Height ${raster.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raster.jpeg.length} >>\nstream\n`), raster.jpeg, text("\nendstream")]),
  ];
  const header = text("%PDF-1.4\n%FORMIQ\n");
  const offsets: number[] = [0];
  const chunks: Uint8Array[] = [header];
  let offset = header.length;
  objects.forEach((object, index) => {
    const wrapped = join([text(`${index + 1} 0 obj\n`), object, text("\nendobj\n")]);
    offsets.push(offset);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return join([...chunks, text(xref)]);
}
