"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultExportEngine, type ExportFormat } from "@/lib";
import { AnalysisEngine, type AnalysisResult } from "@/lib/gis-engine/analysis";
import { ThematicMapEngine, type ThematicMapDefinition } from "@/lib/gis-engine/thematic";
import { buildAnalysisModel, getAnalysisScenario, projectScenario } from "@/features/analysis/model";
import { useAnalysisStore } from "@/store/analysis";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { FormiqEntity, FormiqGeometry, FormiqProjectData } from "@/types/formiq";

type PaperFormat = "A4" | "A3" | "A2";
type Orientation = "landscape" | "portrait";
type ExportId = "pdf" | "svg" | "png" | "illustrator" | "dxf" | "geojson" | "shapefile" | "formiq";
type ViewportKind = "Map 2D" | "Scene 3D";

interface SheetSettings {
  paper: PaperFormat;
  orientation: Orientation;
  marginMm: number;
  gutterMm: number;
  showFrame: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showScale: boolean;
  showNorth: boolean;
  showLabels: boolean;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  scale: string;
}

interface ViewportState {
  id: string;
  name: string;
  kind: ViewportKind;
  locked: boolean;
  selected: boolean;
}

const exportEngine = createDefaultExportEngine();
const analysisEngine = new AnalysisEngine();
const thematicMapEngine = new ThematicMapEngine();
const paperSizes: Record<PaperFormat, { width: number; height: number }> = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
};
const exportItems: Array<{ id: ExportId; title: string; subtitle: string; color: string }> = [
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
  const completeWorkflowStage = useUIStore((state) => state.completeWorkflowStage);
  const activeAnalysisLayerId = useUIStore((state) => state.activeAnalysisLayerId);
  const activeScenarioId = useUIStore((state) => state.activeScenarioId);
  const storedAnalysis = useAnalysisStore((state) => state.result);
  const storedAnalysisProjectId = useAnalysisStore((state) => state.projectId);
  const [settings, setSettings] = useState<SheetSettings>(() => ({
    paper: project.settings.export.paperFormat === "A4" || project.settings.export.paperFormat === "A2" ? project.settings.export.paperFormat : "A3",
    orientation: "landscape",
    marginMm: 15,
    gutterMm: 8,
    showFrame: true,
    showGrid: false,
    showLegend: true,
    showScale: true,
    showNorth: true,
    showLabels: true,
    title: "Карта анализа",
    subtitle: project.name,
    author: project.settings.export.author || project.author || "FORMIQ Studio",
    date: new Intl.DateTimeFormat("ru-RU").format(new Date()),
    scale: "1:2000",
  }));
  const [zoom, setZoom] = useState(55);
  const [status, setStatus] = useState("Лист готов к настройке");
  const [template, setTemplate] = useState("Базовый");
  const [viewportMode, setViewportMode] = useState(false);
  const [viewports, setViewports] = useState<ViewportState[]>([{ id: "main", name: "Основная карта", kind: "Map 2D", locked: false, selected: true }]);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [viewportRotation, setViewportRotation] = useState(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const computedAnalysis = useMemo(() => analysisEngine.analyze(project), [project]);
  const analysis = storedAnalysisProjectId === project.id && storedAnalysis ? storedAnalysis : computedAnalysis;
  const analysisModel = useMemo(() => buildAnalysisModel(analysis), [analysis]);
  const activeScenario = getAnalysisScenario(activeScenarioId);
  const activeProjection = useMemo(() => projectScenario(analysisModel, activeScenario), [activeScenario, analysisModel]);
  const thematicMap = useMemo(() => thematicMapEngine.generate(getThematicMapType(activeAnalysisLayerId), project, analysis), [activeAnalysisLayerId, analysis, project]);
  const automaticScale = useMemo(() => calculateAutomaticScale(project, settings.paper, settings.orientation, settings.marginMm), [project, settings.paper, settings.orientation, settings.marginMm]);
  const effectiveSettings = useMemo(() => settings.scale === automaticScale ? settings : { ...settings, scale: automaticScale }, [automaticScale, settings]);
  const activeAnalysisLabel = getAnalysisLabel(activeAnalysisLayerId);
  const preview = useMemo(() => buildSheetPreview(project, effectiveSettings, thematicMap, activeAnalysisLabel, activeScenario, analysisModel, activeProjection), [project, effectiveSettings, thematicMap, activeAnalysisLabel, activeScenario, analysisModel, activeProjection]);
  const paper = getPaper(effectiveSettings.paper, effectiveSettings.orientation);

  const update = <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewportMode(false);
      if (event.key === "Delete" && viewportMode) setViewports((current) => current.filter((item) => !item.selected || item.id === "main"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewportMode]);

  const handleExport = async (id: ExportId) => {
    setStatus(`Подготовка ${exportItems.find((item) => item.id === id)?.title ?? id}...`);
    try {
      if (id === "formiq") downloadText(JSON.stringify({ project, sheet: effectiveSettings, viewports }, null, 2), `${toFileName(project.name)}.formiq`, "application/json");
      else if (id === "svg") downloadText(preview.svg, `${toFileName(effectiveSettings.title)}.svg`, "image/svg+xml;charset=utf-8");
      else if (id === "illustrator") downloadText(`%!PS-Adobe-3.0\n%%Creator: FORMIQ\n${preview.svg}\n%%EOF`, `${toFileName(effectiveSettings.title)}.ai`, "application/postscript");
      else if (id === "shapefile") downloadText(createProjectGeoJson(project), `${toFileName(project.name)}.geojson`, "application/geo+json");
      else {
        const result = await exportEngine.exportProject(project, { format: id as ExportFormat, filename: toFileName(effectiveSettings.title), paperFormat: effectiveSettings.paper, orientation: effectiveSettings.orientation, quality: "high", resolutionScale: id === "png" ? 2 : 1 });
        downloadBytes(result.data, result.filename, result.mimeType);
      }
      completeWorkflowStage("presentation");
      setStatus("Экспорт подготовлен");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось подготовить экспорт");
    }
  };

  const addViewport = (kind: ViewportKind) => setViewports((current) => [...current.map((item) => ({ ...item, selected: false })), { id: `${kind}-${Date.now()}`, name: kind === "Scene 3D" ? "Изометрия 3D" : "Локатор", kind, locked: false, selected: true }]);

  return (
    <main className="relative h-full overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#EAF6FC_0%,transparent_42%)]" />
      <section className="relative z-10 grid h-full min-h-0 grid-cols-[300px_minmax(620px,1fr)_300px] max-xl:grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:overflow-y-auto" style={{ gap: 12, padding: 12 }}>
        <LeftPanel settings={effectiveSettings} update={update} project={project} onAddViewport={addViewport} analysis={analysis} analysisModel={analysisModel} activeProjection={activeProjection} analysisLabel={activeAnalysisLabel} activeScenarioId={activeScenarioId} />
        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_64px]" style={{ gap: 12 }}>
          <div className="min-h-0 rounded-[20px] border border-white/70 bg-[#EEF2F6]/80 p-3 backdrop-blur-3xl">
            <div className="flex h-full items-center justify-center overflow-hidden rounded-[14px] bg-[#E2E8F0]/55 p-3">
              <div className="relative flex h-full max-h-full w-full items-center justify-center overflow-auto" onMouseUp={() => { dragRef.current = null; }}>
                <div data-testid="presentation-sheet" className="relative shrink-0 bg-white text-[#0F172A]" style={{ width: `${Math.min(100, zoom * 1.45)}%`, maxWidth: 1100, aspectRatio: `${paper.width} / ${paper.height}`, boxShadow: "0 18px 48px rgba(15,23,42,0.12)" }}>
                  <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: preview.svg }} />
                  <div className={`absolute transition ${viewportMode ? "inset-[19%_23%_16%_7%] cursor-crosshair" : "inset-[19%_23%_16%_7%]"}`} style={{ transform: `scale(${viewportZoom}) rotate(${viewportRotation}deg)`, transformOrigin: "center", border: viewportMode ? "2px solid #229ED9" : "1px solid rgba(34,158,217,.28)", background: viewportMode ? "rgba(34,158,217,.04)" : "transparent" }} onDoubleClick={() => setViewportMode(true)} onWheel={(event) => { event.preventDefault(); setViewportZoom((value) => Math.min(2, Math.max(.6, value + (event.deltaY < 0 ? .08 : -.08)))); }} onMouseDown={(event) => { if (event.button === 1) dragRef.current = { x: event.clientX, y: event.clientY }; }} onMouseMove={(event) => { if (dragRef.current && event.shiftKey) setViewportRotation((value) => value + (event.clientX - dragRef.current!.x) * .2); }}>
                    {viewportMode && <div className="absolute -top-10 left-0 flex items-center gap-1 rounded-[12px] border border-white/70 bg-white/90 p-1 text-xs shadow-sm backdrop-blur-xl"><span className="px-2 font-medium">Viewport · {viewports.find((item) => item.selected)?.kind ?? "Map 2D"}</span><button type="button" className="rounded-[8px] px-2 py-1 hover:bg-[#EAF6FC]" onClick={() => setViewportMode(false)}>Готово</button><button type="button" className="rounded-[8px] px-2 py-1 hover:bg-[#EAF6FC]" onClick={() => setViewportZoom(1)}>Сбросить</button></div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <LayoutTemplates active={template} onPick={setTemplate} />
        </section>
        <RightPanel status={status} zoom={zoom} setZoom={setZoom} previewSvg={preview.svg} onExport={handleExport} viewports={viewports} viewportMode={viewportMode} onToggleViewport={() => setViewportMode((value) => !value)} />
      </section>
    </main>
  );
}

function LeftPanel({ settings, update, project, onAddViewport, analysis, analysisModel, activeProjection, analysisLabel, activeScenarioId }: { settings: SheetSettings; update: <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => void; project: FormiqProjectData; onAddViewport: (kind: ViewportKind) => void; analysis: AnalysisResult; analysisModel: ReturnType<typeof buildAnalysisModel>; activeProjection: ReturnType<typeof projectScenario>; analysisLabel: string; activeScenarioId: string }) {
  return <aside className="min-h-0 overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.62] p-5 backdrop-blur-3xl [scrollbar-width:thin]">
    <div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#229ED9]">Layout editor</p><h2 className="mt-1 text-base font-semibold">Лист и компоновка</h2></div><span className="rounded-full bg-[#EAF6FC] px-2 py-1 text-[11px] font-semibold text-[#229ED9]">Live</span></div>
    <div className="mt-4 grid gap-3"><SelectRow label="Формат бумаги" value={`${settings.paper}-${settings.orientation}`} options={["A4-landscape", "A3-landscape", "A2-landscape", "A4-portrait", "A3-portrait"]} onPick={(value) => { const [paper, orientation] = value.split("-"); update("paper", paper as PaperFormat); update("orientation", orientation as Orientation); }} /><div className="rounded-[12px] bg-[#EAF6FC] px-3 py-2 text-[12px]"><div className="flex justify-between font-semibold"><span>Автомасштаб viewport</span><span className="text-[#229ED9]">{settings.scale}</span></div><p className="mt-1 text-[#64748B]">Подобран по границам территории, шаг 100</p></div><RangeRow label="Поля" value={settings.marginMm} suffix="мм" min={5} max={35} onChange={(value) => update("marginMm", value)} /><RangeRow label="Отступы" value={settings.gutterMm} suffix="мм" min={0} max={24} onChange={(value) => update("gutterMm", value)} /></div>
    <section className="mt-4 rounded-[14px] border border-[#E2E8F0] bg-white/[0.42] p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Источник анализа</h3><span className="h-2 w-2 rounded-full bg-[#22C55E]" title="Синхронизировано" /></div><p className="mt-2 text-[13px] font-medium">{analysisLabel}</p><p className="mt-1 text-[12px] text-[#64748B]">Сценарий: {activeScenarioId === "base" ? "Базовый" : activeScenarioId}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[12px]"><MetricValue label="FAR" value={formatNumber(activeProjection.far)} /><MetricValue label="GSI" value={formatNumber(activeProjection.gsi / 100)} /><MetricValue label="Зданий" value={String(analysis.buildings.count)} /><MetricValue label="Озеленение" value={analysisModel.metricsById.green.value} /></div></section>
    <section className="mt-4 grid gap-1"><p className="mb-1 text-[12px] font-semibold uppercase tracking-[.06em] text-[#64748B]">Слои листа</p>{[["Рамка", "showFrame"], ["Сетка", "showGrid"], ["Легенда", "showLegend"], ["Масштаб", "showScale"], ["Северная стрелка", "showNorth"], ["Подписи", "showLabels"]].map(([label, key]) => <ToggleRow key={key} label={label} checked={settings[key as keyof SheetSettings] as boolean} onChange={(checked) => update(key as keyof SheetSettings, checked as never)} />)}</section>
    <section className="mt-4 border-t border-[#E2E8F0] pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Viewport-области</h3><span className="text-[12px] text-[#64748B]">живые данные</span></div><div className="mt-2 grid gap-1 rounded-[14px] border border-white/70 bg-white/[0.45] p-2">{["Основная карта"].map((name) => <div key={name} className="flex items-center justify-between rounded-[10px] bg-[#EAF6FC] px-3 py-2 text-[13px]"><span>◈ {name}</span><span className="text-[11px] text-[#229ED9]">Map 2D</span></div>)}<button type="button" onClick={() => onAddViewport("Map 2D")} className="mt-1 rounded-[10px] px-3 py-2 text-left text-[13px] text-[#64748B] hover:bg-white/80">+ Добавить locator map</button><button type="button" onClick={() => onAddViewport("Scene 3D")} className="rounded-[10px] px-3 py-2 text-left text-[13px] text-[#64748B] hover:bg-white/80">+ Добавить Scene 3D</button></div></section>
    <section className="mt-4 border-t border-[#E2E8F0] pt-4"><h3 className="text-sm font-semibold">Информация о листе</h3><div className="mt-3 grid gap-2"><Field label="Название листа" value={settings.title} onChange={(value) => update("title", value)} /><Field label="Подзаголовок" value={settings.subtitle || project.name} onChange={(value) => update("subtitle", value)} /><Field label="Автор" value={settings.author} onChange={(value) => update("author", value)} /><Field label="Дата" value={settings.date} onChange={(value) => update("date", value)} /></div></section>
  </aside>;
}

function MetricValue({ label, value }: { label: string; value: string }) { return <div className="rounded-[10px] bg-white/[0.62] px-2 py-1.5"><span className="block text-[#64748B]">{label}</span><strong className="text-[13px]">{value}</strong></div>; }

function RightPanel({ status, zoom, setZoom, previewSvg, onExport, viewports, viewportMode, onToggleViewport }: { status: string; zoom: number; setZoom: (value: number) => void; previewSvg: string; onExport: (id: ExportId) => void; viewports: ViewportState[]; viewportMode: boolean; onToggleViewport: () => void }) {
  return <aside className="flex min-h-0 flex-col overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.62] p-5 backdrop-blur-3xl max-xl:col-span-2 max-xl:grid max-xl:grid-cols-[minmax(0,1fr)_280px] max-lg:col-span-1 max-lg:flex"><section><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">Экспорт листа</h2><p className="mt-1 text-[13px] text-[#64748B]">Профессиональные форматы</p></div><span className="h-2 w-2 rounded-full bg-[#22C55E]" title="Лист синхронизирован" /></div><div className="mt-3 grid gap-1">{exportItems.map((item) => <button key={item.id} type="button" data-testid={`export-${item.id}`} onClick={() => void onExport(item.id)} className="flex min-h-[44px] items-center gap-3 rounded-[12px] px-2 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-white/75"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[10px] font-bold text-white" style={{ backgroundColor: item.color }}>{item.title.slice(0, 3)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-[12px] text-[#64748B]">{item.subtitle}</span></span><span className="text-lg text-[#64748B]">↓</span></button>)}</div><p className="mt-3 rounded-[12px] bg-white/[0.5] px-3 py-2 text-[12px] text-[#64748B]">{status}</p></section><section className="mt-4 border-t border-[#E2E8F0] pt-4 max-xl:mt-0 max-xl:border-t-0 max-xl:pt-0 max-lg:mt-4 max-lg:border-t max-lg:pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Инструменты viewport</h3><button type="button" onClick={onToggleViewport} className={`rounded-[10px] px-2 py-1 text-[12px] font-semibold ${viewportMode ? "bg-[#229ED9] text-white" : "bg-white/70 text-[#229ED9]"}`}>{viewportMode ? "Редактирование" : "Выбрать"}</button></div><div className="mt-2 grid gap-1">{viewports.map((viewport) => <div key={viewport.id} className="flex items-center justify-between rounded-[10px] bg-white/[0.45] px-2 py-2 text-[12px]"><span>{viewport.name}</span><span className="text-[#64748B]">{viewport.kind}</span></div>)}</div></section><section className="mt-4 min-h-0 border-t border-[#E2E8F0] pt-4"><h3 className="text-sm font-semibold">Предпросмотр листа</h3><div className="mt-3 overflow-hidden rounded-[14px] border border-[#CBD5E1]/70 bg-white p-2" dangerouslySetInnerHTML={{ __html: previewSvg }} /><div className="mt-3 flex items-center justify-center gap-2"><button type="button" aria-label="Уменьшить лист" onClick={() => setZoom(Math.max(35, zoom - 5))} className="grid h-9 w-9 place-items-center rounded-[12px] border border-white/70 bg-white/60 text-lg">−</button><span className="grid h-9 w-16 place-items-center rounded-[12px] border border-white/70 bg-white/60 text-sm font-semibold">{zoom}%</span><button type="button" aria-label="Увеличить лист" onClick={() => setZoom(Math.min(90, zoom + 5))} className="grid h-9 w-9 place-items-center rounded-[12px] border border-white/70 bg-white/60 text-lg">+</button></div></section></aside>;
}

function LayoutTemplates({ active, onPick }: { active: string; onPick: (value: string) => void }) { const templates = ["Базовый", "Минимализм", "Сетка", "Классика"]; return <section className="grid h-16 grid-cols-5 rounded-[20px] border border-white/70 bg-white/[0.62] p-2 backdrop-blur-3xl max-lg:h-auto max-lg:grid-cols-2" style={{ gap: 8 }}>{templates.map((item) => <button key={item} type="button" onClick={() => onPick(item)} className={`flex h-12 items-center gap-3 rounded-[14px] border px-3 text-left text-sm transition duration-200 hover:-translate-y-0.5 ${active === item ? "border-[#229ED9] bg-[#EAF6FC]" : "border-white/70 bg-white/[0.45]"}`}><span className="h-9 w-8 rounded-[8px] border border-[#CBD5E1] bg-white" /><span><span className="block font-semibold">{item}</span><span className="text-[12px] text-[#64748B]">{active === item ? "Текущий" : "Альбомный"}</span></span></button>)}<button type="button" className="h-12 rounded-[14px] border border-dashed border-[#CBD5E1] bg-white/[0.35] text-sm font-semibold text-[#64748B]">+ Создать шаблон</button></section>; }

function SelectRow({ label, value, options, onPick }: { label: string; value: string; options: string[]; onPick: (value: string) => void }) { return <label className="grid gap-1 text-[12px] font-semibold text-[#64748B]">{label}<select value={value} onChange={(event) => onPick(event.target.value)} className="h-9 rounded-[10px] border border-[#CBD5E1] bg-white px-2 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#229ED9]">{options.map((option) => <option key={option} value={option}>{option.replace("-", " ")}</option>)}</select></label>; }
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex h-9 items-center justify-between rounded-[10px] px-2 text-[13px] font-medium hover:bg-white/60">{label}<input type="checkbox" className="h-4 w-4 accent-[#229ED9]" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function RangeRow({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) { return <label className="grid gap-1 rounded-[12px] bg-white/[0.45] px-3 py-2 text-[12px] font-semibold"><span className="flex justify-between"><span>{label}</span><span className="text-[#64748B]">{value} {suffix}</span></span><input type="range" min={min} max={max} value={value} className="h-2 accent-[#229ED9]" onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-[12px] font-medium text-[#64748B]">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-[10px] border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0F172A] outline-none focus:border-[#229ED9]" /></label>; }

function buildSheetPreview(project: FormiqProjectData, settings: SheetSettings, thematicMap: ThematicMapDefinition | null, analysisLabel: string, scenario: ReturnType<typeof getAnalysisScenario>, analysisModel: ReturnType<typeof buildAnalysisModel>, projection: ReturnType<typeof projectScenario>) { const paper = getPaper(settings.paper, settings.orientation); const width = 1120; const height = Math.round(width * (paper.height / paper.width)); const margin = Math.round((settings.marginMm / paper.width) * width); const mapBox = { x: margin + 26, y: margin + 112, width: width - margin * 2 - 260, height: height - margin * 2 - 218 }; const shapes = collectPreviewShapes(project, mapBox, thematicMap); const grid = settings.showGrid ? createGrid(width, height, margin) : ""; const legend = settings.showLegend ? createLegend(width - margin - 170, margin + 260, thematicMap, analysisLabel) : ""; const north = settings.showNorth ? createNorthArrow(width - margin - 70, margin + 48) : ""; const scale = settings.showScale ? createScaleBar(margin + 40, height - margin - 88, settings.scale) : ""; const frame = settings.showFrame ? `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#0F172A" stroke-width="1.2"/>` : ""; const labels = settings.showLabels ? createTitleBlock(width - margin - 300, height - margin - 104, settings, project) : ""; const metrics = createMetricStrip(margin + 44, margin + 102, mapBox.width, analysisModel, projection); return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="Лист компоновки FORMIQ"><rect width="${width}" height="${height}" fill="#fff"/>${grid}<rect x="${margin + 14}" y="${margin + 14}" width="${width - margin * 2 - 28}" height="${height - margin * 2 - 28}" fill="none" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="5 5"/>${frame}<text x="${margin + 44}" y="${margin + 60}" font-family="Inter,Arial" font-size="30" font-weight="700" fill="#0F172A">${escapeXml(settings.title.toUpperCase())}</text><text x="${margin + 44}" y="${margin + 88}" font-family="Inter,Arial" font-size="16" fill="#64748B">${escapeXml(settings.subtitle)} · ${escapeXml(scenario.title)}</text>${metrics}<g opacity="0.85"><rect x="${mapBox.x}" y="${mapBox.y}" width="${mapBox.width}" height="${mapBox.height}" fill="#F8FAFC"/>${createBasePlan(mapBox)}${shapes}</g>${legend}${north}${scale}${labels}</svg>` }; }
function getPaper(format: PaperFormat, orientation: Orientation) { const size = paperSizes[format]; return orientation === "landscape" ? size : { width: size.height, height: size.width }; }
function collectPreviewShapes(project: FormiqProjectData, box: { x: number; y: number; width: number; height: number }, thematicMap: ThematicMapDefinition | null) { const entities: FormiqEntity[] = [...project.buildings, ...project.vegetation, ...project.water, ...project.roads]; const bounds = getEntityBounds(entities) ?? project.territories.find((territory) => territory.id === project.activeTerritoryId)?.bounds ?? project.metadata.bounds; if (!entities.length || !bounds) return createFallbackPlan(box); const thematicColors = new Map((thematicMap?.geojson.features ?? []).map((feature) => [String(feature.id ?? feature.properties?.id), String(feature.properties?.renderColor ?? "#CBD5E1")])); return entities.map((entity, index) => { const path = geometryToSvgPath(entity.geometry, bounds, box); if (!path) return ""; const road = entity.type === "road"; const fill = thematicColors.get(entity.id) ?? getEntityColor(entity, index); return `<path d="${path}" fill="${road ? "none" : fill}" stroke="${road ? "#CBD5E1" : "#fff"}" stroke-width="${road ? 2 : 1}" opacity="${road ? ".82" : ".95"}"/>`; }).join(""); }
function createBasePlan(box: { x: number; y: number; width: number; height: number }) { return Array.from({ length: 24 }, (_, index) => { const y = box.y + 20 + index * (box.height / 22); return `<path d="M${box.x + 10} ${y} L${box.x + box.width - 10} ${y + ((index % 3) - 1) * 12}" stroke="#CBD5E1" stroke-width="1" opacity=".45"/>`; }).join("") + Array.from({ length: 30 }, (_, index) => { const x = box.x + 20 + ((index * 73) % Math.max(1, box.width - 90)); const y = box.y + 16 + ((index * 47) % Math.max(1, box.height - 80)); return `<rect x="${x}" y="${y}" width="${35 + (index % 4) * 12}" height="${18 + (index % 3) * 10}" fill="#D1D5DB" opacity=".55" transform="rotate(${(index % 5) - 2} ${x} ${y})"/>`; }).join(""); }
function createMetricStrip(x: number, y: number, width: number, model: ReturnType<typeof buildAnalysisModel>, projection: ReturnType<typeof projectScenario>) { const items = [["FAR", formatNumber(projection.far)], ["GSI", formatNumber(projection.gsi / 100)], ["KPI", `${projection.score}/100`], ["Зданий", String(model.metricsById.floors.detail.split(" ")[0])], ["Озеленение", model.metricsById.green.value]]; const itemWidth = Math.max(88, Math.floor(width / items.length)); return `<g>${items.map(([label, value], index) => { const itemX = x + index * itemWidth; return `<g><text x="${itemX}" y="${y}" font-family="Inter,Arial" font-size="10" fill="#64748B">${label}</text><text x="${itemX}" y="${y + 18}" font-family="Inter,Arial" font-size="16" font-weight="700" fill="#0F172A">${escapeXml(value)}</text></g>`; }).join("")}</g>`; }
function createFallbackPlan(box: { x: number; y: number; width: number; height: number }) { return Array.from({ length: 42 }, (_, index) => { const x = box.x + 70 + ((index * 61) % Math.max(1, box.width - 180)); const y = box.y + 80 + ((index * 43) % Math.max(1, box.height - 190)); const color = ["#B91C1C", "#DC2626", "#F97316", "#FDBA74", "#F472B6"][index % 5]; return `<rect x="${x}" y="${y}" width="${24 + (index % 4) * 12}" height="${16 + (index % 3) * 12}" fill="${color}" opacity=".9" transform="rotate(${(index % 7) - 3} ${x} ${y})"/>`; }).join(""); }
function geometryToSvgPath(geometry: FormiqGeometry, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }) { if (geometry.type === "point") { const point = projectPoint(geometry.coordinates, bounds, box); return `M${point[0] - 3} ${point[1]} a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0`; } if (geometry.type === "line") return positionsToPath(geometry.coordinates, bounds, box, false); return geometry.rings.map((ring) => positionsToPath(ring, bounds, box, true)).join(" "); }
function positionsToPath(positions: Array<[number, number] | number[]>, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }, closed: boolean) { const points = positions.map((position) => projectPoint(position, bounds, box)); if (!points.length) return ""; return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point[0]} ${point[1]}`).join(" ")}${closed ? " Z" : ""}`; }
function projectPoint(position: Array<number>, bounds: { west: number; south: number; east: number; north: number }, box: { x: number; y: number; width: number; height: number }): [number, number] { const longitudeMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos(((bounds.north + bounds.south) / 2 * Math.PI) / 180), 1); const latitudeMeters = Math.max((bounds.north - bounds.south) * 110540, 1); const scale = Math.min(box.width / longitudeMeters, box.height / latitudeMeters); const renderedWidth = longitudeMeters * scale; const renderedHeight = latitudeMeters * scale; const offsetX = box.x + (box.width - renderedWidth) / 2; const offsetY = box.y + (box.height - renderedHeight) / 2; return [Math.round(offsetX + ((position[0] - bounds.west) * 111320 * Math.cos(((bounds.north + bounds.south) / 2 * Math.PI) / 180)) * scale), Math.round(offsetY + (1 - ((position[1] - bounds.south) * 110540) / latitudeMeters) * renderedHeight)]; }
function getEntityBounds(entities: FormiqEntity[]) { const positions = entities.flatMap((entity) => getPositions(entity.geometry)); if (!positions.length) return null; return { west: Math.min(...positions.map((point) => point[0])), south: Math.min(...positions.map((point) => point[1])), east: Math.max(...positions.map((point) => point[0])), north: Math.max(...positions.map((point) => point[1])) }; }
function getPositions(geometry: FormiqGeometry): Array<[number, number]> { if (geometry.type === "point") return [[geometry.coordinates[0], geometry.coordinates[1]]]; if (geometry.type === "line") return geometry.coordinates.map((point) => [point[0], point[1]]); return geometry.rings.flat().map((point) => [point[0], point[1]]); }
function getEntityColor(entity: FormiqEntity, index: number) { if (entity.type === "vegetation") return "#C7DFA8"; if (entity.type === "water") return "#BFE7F1"; if (entity.type === "road") return "#CBD5E1"; return ["#B91C1C", "#DC2626", "#F97316", "#FDBA74", "#F472B6"][index % 5]; }
function createGrid(width: number, height: number, margin: number) { return `<g opacity=".7">${Array.from({ length: 5 }, (_, index) => { const x = margin + ((width - margin * 2) / 4) * index; return `<path d="M${x} ${margin} L${x} ${height - margin}" stroke="#E2E8F0"/>`; }).join("")}${Array.from({ length: 4 }, (_, index) => { const y = margin + ((height - margin * 2) / 3) * index; return `<path d="M${margin} ${y} L${width - margin} ${y}" stroke="#E2E8F0"/>`; }).join("")}</g>`; }
function createLegend(x: number, y: number, thematicMap: ThematicMapDefinition | null, analysisLabel: string) { const items = thematicMap?.legend.slice(0, 6).map((item) => [item.color, item.label]) ?? [["#B91C1C", "Застройка"], ["#F97316", "Общественные зоны"], ["#C7DFA8", "Озеленение"], ["#BFE7F1", "Вода"]]; return `<g><rect x="${x}" y="${y}" width="160" height="${Math.max(150, 46 + items.length * 24)}" fill="#fff" stroke="#CBD5E1"/><text x="${x + 16}" y="${y + 28}" font-family="Inter,Arial" font-size="14" font-weight="700">${escapeXml(analysisLabel.toUpperCase())}</text>${items.map(([color, label], index) => `<rect x="${x + 16}" y="${y + 52 + index * 24}" width="22" height="12" fill="${color}"/><text x="${x + 48}" y="${y + 63 + index * 24}" font-family="Inter,Arial" font-size="11">${escapeXml(label)}</text>`).join("")}</g>`; }
function createNorthArrow(x: number, y: number) { return `<g><text x="${x + 17}" y="${y}" font-family="Inter,Arial" font-size="24" font-weight="700" text-anchor="middle">N</text><path d="M${x + 17} ${y + 12} L${x} ${y + 78} L${x + 17} ${y + 64} L${x + 34} ${y + 78} Z" fill="#0F172A"/></g>`; }
function createScaleBar(x: number, y: number, scale: string) { return `<g><text x="${x}" y="${y - 12}" font-family="Inter,Arial" font-size="13">0</text><text x="${x + 95}" y="${y - 12}" font-family="Inter,Arial" font-size="13">100</text><text x="${x + 195}" y="${y - 12}" font-family="Inter,Arial" font-size="13">200 м</text><rect x="${x}" y="${y}" width="100" height="8" fill="#0F172A"/><rect x="${x + 100}" y="${y}" width="100" height="8" fill="#fff" stroke="#0F172A"/><text x="${x}" y="${y + 34}" font-family="Inter,Arial" font-size="16">Масштаб ${scale}</text></g>`; }
function createTitleBlock(x: number, y: number, settings: SheetSettings, project: FormiqProjectData) { const rows = [["Проект", project.name], ["Лист", settings.title], ["Формат", `${settings.paper} (${settings.orientation === "landscape" ? "альбомный" : "книжный"})`], ["Дата", settings.date]]; return `<g><rect x="${x}" y="${y}" width="290" height="104" fill="#fff" stroke="#94A3B8"/>${rows.map(([label, value], index) => `<path d="M${x} ${y + 26 * index} H${x + 290}" stroke="#CBD5E1"/><text x="${x + 12}" y="${y + 18 + 26 * index}" font-family="Inter,Arial" font-size="12">${label}</text><text x="${x + 86}" y="${y + 18 + 26 * index}" font-family="Inter,Arial" font-size="12">${escapeXml(value)}</text>`).join("")}<path d="M${x + 74} ${y} V${y + 104}" stroke="#CBD5E1"/><text x="${x + 236}" y="${y + 70}" font-family="Inter,Arial" font-size="28" text-anchor="middle">FORMIQ</text></g>`; }
function createProjectGeoJson(project: FormiqProjectData) { const entities = [...project.buildings, ...project.roads, ...project.vegetation, ...project.water, ...project.boundaries, ...project.poi, ...project.transitStops]; return JSON.stringify({ type: "FeatureCollection", features: entities.map((entity) => ({ type: "Feature", properties: { id: entity.id, type: entity.type, source: entity.source }, geometry: formiqGeometryToGeoJson(entity.geometry) })) }, null, 2); }
function formiqGeometryToGeoJson(geometry: FormiqGeometry) { if (geometry.type === "point") return { type: "Point", coordinates: geometry.coordinates }; if (geometry.type === "line") return { type: "LineString", coordinates: geometry.coordinates }; return { type: "Polygon", coordinates: geometry.rings }; }
function getThematicMapType(layerId: string) { if (layerId === "green") return "vegetation"; if (layerId === "insolation") return "floors"; if (layerId === "transport") return "accessibility"; if (layerId === "scenarios") return "none"; return "density"; }
function getAnalysisLabel(layerId: string) { return ({ far: "FAR", gsi: "GSI", density: "Плотность", insolation: "Инсоляция", green: "Озеленение", transport: "Транспортная доступность", scenarios: "Сценарии" } as Record<string, string>)[layerId] ?? "Анализ"; }
function calculateAutomaticScale(project: FormiqProjectData, paperFormat: PaperFormat, orientation: Orientation, marginMm: number) { const bounds = project.territories.find((territory) => territory.id === project.activeTerritoryId)?.bounds ?? project.metadata.bounds; if (!bounds) return "1:2000"; const latitude = (bounds.north + bounds.south) / 2; const widthMeters = Math.max((bounds.east - bounds.west) * 111320 * Math.cos((latitude * Math.PI) / 180), 1); const heightMeters = Math.max((bounds.north - bounds.south) * 110540, 1); const paper = getPaper(paperFormat, orientation); const mapWidthMm = Math.max(paper.width - marginMm * 2 - 50, 80); const mapHeightMm = Math.max(paper.height - marginMm * 2 - 70, 80); const required = Math.max((widthMeters * 1000) / mapWidthMm, (heightMeters * 1000) / mapHeightMm); const rounded = Math.max(100, Math.ceil(required / 100) * 100); return `1:${rounded}`; }
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0); }
function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character); }
function toFileName(value: string) { return value.trim().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "formiq-layout"; }
function downloadText(text: string, filename: string, mimeType: string) { downloadBytes(new TextEncoder().encode(text), filename, mimeType); }
function downloadBytes(data: Uint8Array, filename: string, mimeType: string) { const blob = new Blob([new Uint8Array(data)], { type: mimeType }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
