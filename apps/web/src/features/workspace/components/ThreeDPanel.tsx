"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { getTerrainSourceProviders, ThreeDThematicMapEngine } from "@/lib";
import { useProjectStore } from "@/store/project";
import type {
  ProjectThreeDSettings,
  TerrainSourceId,
  ThreeDMapType,
  ThreeDTerrainMode,
} from "@/types/formiq";
import ThreeDLegend from "./ThreeDLegend";

type CameraPreset = ProjectThreeDSettings["cameraPreset"];
type LightingTime = ProjectThreeDSettings["lightingTime"];

const threeDEngine = new ThreeDThematicMapEngine();

const cameraPresets: Array<{ id: CameraPreset; label: string; pitch: number; bearing: number; zoomDelta: number }> = [
  { id: "north-west", label: "Общий вид", pitch: 62, bearing: -38, zoomDelta: 0 },
  { id: "west", label: "С запада", pitch: 58, bearing: -90, zoomDelta: -0.1 },
  { id: "north", label: "С севера", pitch: 58, bearing: 0, zoomDelta: -0.1 },
  { id: "top", label: "Сверху", pitch: 0, bearing: 0, zoomDelta: 0.35 },
  { id: "presentation", label: "Презентация", pitch: 66, bearing: -28, zoomDelta: 0.2 },
];

const modeNavigation: Array<{ id: string; title: string; subtitle: string; icon: IconName }> = [
  { id: "views", title: "Виды", subtitle: "Сохраненные ракурсы", icon: "image" },
  { id: "white", title: "Белая модель", subtitle: "Отображение модели", icon: "cube" },
  { id: "extrusion", title: "Экструзия", subtitle: "Высотная модель", icon: "blocks" },
  { id: "terrain", title: "Рельеф", subtitle: "Поверхность участка", icon: "cloud" },
  { id: "poi", title: "POI", subtitle: "Точки интереса", icon: "pin" },
  { id: "roads", title: "Дороги", subtitle: "Уличная сеть", icon: "road" },
  { id: "zones", title: "Зоны", subtitle: "Функциональные зоны", icon: "zones" },
  { id: "camera", title: "Камера", subtitle: "Ракурс и движение", icon: "target" },
  { id: "light", title: "Освещение", subtitle: "Свет и тени", icon: "sun" },
];

export default function ThreeDPanel() {
  const project = useProjectStore((state) => state.project);
  const setThreeDSettings = useProjectStore((state) => state.setThreeDSettings);
  const settings = withThreeDDefaults(project.settings.threeD);
  const terrainSettings = settings.terrain;
  const terrainProviders = getTerrainSourceProviders(project);
  const renderMap = useMemo(() => threeDEngine.build(project), [project]);
  const definitions = threeDEngine.getDefinitions();
  const modelStats = useMemo(
    () => ({
      buildings: project.buildings.length,
      roads: project.roads.length,
      zones: project.vegetation.length + project.water.length + project.boundaries.length,
      poi: project.poi.length + project.transitStops.length,
      terrain: project.terrain.length,
    }),
    [project]
  );

  const update = (patch: Partial<ProjectThreeDSettings>) => {
    setThreeDSettings(patch);
  };

  const updateTerrain = (patch: Partial<typeof terrainSettings>) => {
    const nextTerrain = { ...terrainSettings, ...patch };
    update({ showTerrain: nextTerrain.enabled, terrain: nextTerrain });
  };

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraPresets.find((item) => item.id === preset) ?? cameraPresets[0];
    const map = getSceneMap();
    update({ cameraPreset: preset });
    map?.easeTo({
      pitch: camera.pitch,
      bearing: camera.bearing,
      zoom: Math.max(8, Math.min(18, map.getZoom() + camera.zoomDelta)),
      duration: 600,
    });
  };

  const captureScreenshot = () => {
    const now = new Date();
    update({
      screenshots: [
        {
          id: `shot-${now.getTime()}`,
          name: `Снимок ${settings.screenshots.length + 1}`,
          createdAt: now.toISOString(),
          preset: settings.cameraPreset,
        },
        ...settings.screenshots,
      ].slice(0, 6),
    });
  };

  const runFlythrough = () => {
    const map = getSceneMap();
    update({ flythroughEnabled: true });
    if (!map) return;

    const sequence = [
      { pitch: 64, bearing: -42, zoom: map.getZoom() + 0.2, duration: 900 },
      { pitch: 58, bearing: 28, zoom: map.getZoom() + 0.1, duration: 1100 },
      { pitch: 68, bearing: -115, zoom: map.getZoom() + 0.25, duration: 1200 },
    ];
    sequence.forEach((step, index) => {
      window.setTimeout(() => map.easeTo(step), index * 950);
    });
    window.setTimeout(() => update({ flythroughEnabled: false }), sequence.length * 1000 + 300);
  };

  const saveView = () => {
    const preset = settings.cameraPreset;
    update({
      savedViews: [
        {
          id: `view-${Date.now()}`,
          name: `Вид ${settings.savedViews.length + 1}`,
          preset,
          thumbnail: preset,
        },
        ...settings.savedViews,
      ].slice(0, 7),
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 text-[#0F172A]">
      <aside className="pointer-events-auto absolute bottom-6 left-6 top-6 flex w-[300px] flex-col gap-3 max-xl:w-[260px] max-lg:hidden">
        <section className="rounded-[20px] border border-white/70 bg-white/[0.62] p-4 backdrop-blur-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">Режим 3D</p>
          <div className="mt-3 space-y-1">
            {modeNavigation.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${
                  index === 0 ? "bg-[#229ED9]/10 text-[#0F172A]" : "hover:bg-white/65"
                }`}
              >
                <Icon name={item.icon} className={index === 0 ? "text-[#229ED9]" : "text-[#334155]"} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-[12px] text-[#64748B]">{item.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 rounded-[20px] border border-white/70 bg-white/[0.62] p-4 backdrop-blur-3xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">Сохраненные виды</p>
            <button type="button" onClick={saveView} className="grid h-8 w-8 place-items-center rounded-[12px] border border-white/70 bg-white/60 text-lg text-[#229ED9]">
              +
            </button>
          </div>
          <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {settings.savedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => applyCameraPreset(view.preset)}
                className={`flex w-full items-center gap-3 rounded-[14px] border px-2 py-2 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${
                  view.preset === settings.cameraPreset ? "border-[#229ED9] bg-[#EAF6FC]" : "border-white/70 bg-white/45"
                }`}
              >
                <span className="h-10 w-14 rounded-[10px] border border-[#CBD5E1] bg-[linear-gradient(135deg,#F8FAFC,#DCE8F0)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{view.name}</span>
                  <span className="block text-[12px] text-[#64748B]">{getPresetLabel(view.preset)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="pointer-events-auto absolute left-1/2 top-6 flex -translate-x-1/2 overflow-hidden rounded-[20px] border border-white/70 bg-white/[0.62] backdrop-blur-3xl max-lg:left-4 max-lg:right-4 max-lg:translate-x-0">
        <ToolbarButton icon="target" label="Центрировать" onClick={() => applyCameraPreset(settings.cameraPreset)} />
        <ToolbarButton icon="zoom" label="Масштаб" onClick={() => getSceneMap()?.zoomIn()} />
        <ToolbarButton icon="rotate" label="Вращение" onClick={() => getSceneMap()?.easeTo({ bearing: (getSceneMap()?.getBearing() ?? 0) - 30, duration: 350 })} />
        <ToolbarButton icon="tilt" label="Наклон" onClick={() => getSceneMap()?.easeTo({ pitch: 66, duration: 350 })} />
        <ToolbarButton icon="screen" label="Снимок" onClick={captureScreenshot} />
        <ToolbarButton icon="play" label={settings.flythroughEnabled ? "Облет..." : "Облет"} onClick={runFlythrough} />
      </section>

      <aside className="pointer-events-auto absolute bottom-6 right-6 top-6 w-[320px] overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.62] p-4 backdrop-blur-3xl [scrollbar-width:thin] max-xl:w-[300px] max-lg:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#334155]">Настройки 3D вида</h2>
        <Section title="Отображение модели">
          <SelectControl
            label="Режим отображения"
            value={settings.activeMapType}
            onChange={(value) => update({ activeMapType: value as ThreeDMapType })}
            options={definitions.map((definition) => ({ value: definition.id, label: definition.title }))}
          />
          <Toggle label="Белая модель" checked={settings.activeMapType === "white-model"} onChange={() => update({ activeMapType: "white-model", visualStyle: "presentation" })} />
          <Toggle label="Экструзия" checked={settings.showBuildings} onChange={(checked) => update({ showBuildings: checked })} />
          <Toggle label="Высоты" checked={settings.showHeights} onChange={(checked) => update({ showHeights: checked })} />
        </Section>

        <Section title="Рельеф">
          <Toggle label="Отображение рельефа" checked={terrainSettings.enabled} onChange={(checked) => updateTerrain({ enabled: checked })} />
          <SelectControl
            label="Источник высот"
            value={terrainSettings.source}
            onChange={(value) => updateTerrain({ source: value as TerrainSourceId })}
            options={terrainProviders.map((provider) => ({ value: provider.id, label: provider.name }))}
          />
          <SelectControl
            label="Тип поверхности"
            value={terrainSettings.mode}
            onChange={(value) => updateTerrain({ mode: value as ThreeDTerrainMode })}
            options={[
              { value: "flat", label: "Плоскость" },
              { value: "points", label: "Точки высот" },
              { value: "surface-preview", label: "Поверхность" },
            ]}
          />
          <Slider label="Вертикальное преувеличение" value={terrainSettings.exaggeration} min={0.2} max={5} step={0.1} suffix="x" onChange={(value) => updateTerrain({ exaggeration: value })} />
        </Section>

        <Section title="Слои сцены">
          <Toggle label="Дороги" checked={settings.showRoads} onChange={(checked) => update({ showRoads: checked })} />
          <Toggle label="POI" checked={settings.showPoi} onChange={(checked) => update({ showPoi: checked })} />
          <Toggle label="Зоны" checked={settings.showZones} onChange={(checked) => update({ showZones: checked })} />
          <Toggle label="Вода" checked={settings.showWater} onChange={(checked) => update({ showWater: checked })} />
          <Toggle label="Озеленение" checked={settings.showVegetation} onChange={(checked) => update({ showVegetation: checked })} />
          <Toggle label="Граница территории" checked={settings.showTerritoryBoundary} onChange={(checked) => update({ showTerritoryBoundary: checked })} />
        </Section>

        <Section title="Камера и свет">
          <SelectControl
            label="Ракурс"
            value={settings.cameraPreset}
            onChange={(value) => applyCameraPreset(value as CameraPreset)}
            options={cameraPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
          />
          <SelectControl
            label="Время"
            value={settings.lightingTime}
            onChange={(value) => update({ lightingTime: value as LightingTime })}
            options={[
              { value: "09:00", label: "09:00" },
              { value: "12:00", label: "12:00" },
              { value: "15:00", label: "15:00" },
              { value: "18:00", label: "18:00" },
            ]}
          />
          <Toggle label="Тени" checked={settings.shadows} onChange={(checked) => update({ shadows: checked })} />
        </Section>

        <Section title="Презентация">
          <button type="button" onClick={() => applyCameraPreset("presentation")} className="h-10 w-full rounded-[14px] bg-[#229ED9] text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5">
            Открыть презентационный вид
          </button>
          <button type="button" onClick={captureScreenshot} className="mt-2 h-10 w-full rounded-[14px] border border-white/70 bg-white/60 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5">
            Сделать снимок
          </button>
          <div className="mt-3 space-y-1.5">
            {settings.screenshots.length ? (
              settings.screenshots.map((shot) => (
                <div key={shot.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-white/70 bg-white/45 px-3 py-2 text-[12px]">
                  <span className="truncate font-semibold">{shot.name}</span>
                  <span className="shrink-0 text-[#64748B]">{new Date(shot.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))
            ) : (
              <p className="rounded-[12px] border border-white/70 bg-white/45 px-3 py-2 text-[12px] text-[#64748B]">Снимки появятся здесь.</p>
            )}
          </div>
        </Section>

        {settings.showLegend ? (
          <ThreeDLegend
            title={renderMap.definition.title}
            items={renderMap.definition.legend}
            sourceLabel={formatSourceLabel(project)}
            dateLabel={new Date().toLocaleDateString("ru-RU")}
            presentation
            terrainSummary={renderMap.terrainSummary}
          />
        ) : null}
      </aside>

      <div className="pointer-events-auto absolute right-[360px] top-8 grid h-[68px] w-[68px] place-items-center rounded-full border border-white/70 bg-white/[0.62] backdrop-blur-3xl max-xl:right-[330px] max-lg:right-6">
        <div className="text-center">
          <div className="text-xs font-bold">N</div>
          <Icon name="compass" className="mx-auto mt-1 h-8 w-8 text-[#0F172A]" />
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-6 right-[360px] grid overflow-hidden rounded-[18px] border border-white/70 bg-white/[0.62] backdrop-blur-3xl max-xl:right-[330px] max-lg:right-6">
        <button type="button" onClick={() => getSceneMap()?.zoomIn()} className="grid h-11 w-11 place-items-center border-b border-white/70 text-xl font-semibold">+</button>
        <button type="button" onClick={() => getSceneMap()?.zoomOut()} className="grid h-11 w-11 place-items-center text-xl font-semibold">-</button>
      </div>

      <section className="pointer-events-auto absolute bottom-6 left-[340px] w-[360px] rounded-[20px] border border-white/70 bg-white/[0.62] p-4 backdrop-blur-3xl max-xl:left-[300px] max-lg:hidden">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#334155]">Профиль рельефа</p>
        <div className="mt-3 h-24">
          <svg viewBox="0 0 320 92" className="h-full w-full">
            <path d="M0 70 C30 42 58 58 88 54 C126 48 130 24 166 35 C204 46 208 72 246 58 C278 45 292 22 320 30 L320 92 L0 92 Z" fill="#EAF6FC" />
            <path d="M0 70 C30 42 58 58 88 54 C126 48 130 24 166 35 C204 46 208 72 246 58 C278 45 292 22 320 30" fill="none" stroke="#229ED9" strokeWidth="2" />
            <text x="0" y="18" fontSize="10" fill="#64748B">150 м</text>
            <text x="0" y="50" fontSize="10" fill="#64748B">100 м</text>
            <text x="0" y="88" fontSize="10" fill="#64748B">0</text>
            <text x="150" y="88" fontSize="10" fill="#64748B">500 м</text>
            <text x="292" y="88" fontSize="10" fill="#64748B">1 км</text>
          </svg>
        </div>
      </section>

      <section className="pointer-events-auto absolute bottom-4 left-4 right-4 hidden max-h-[42vh] overflow-y-auto rounded-[20px] border border-white/70 bg-white/[0.72] p-3 backdrop-blur-3xl [scrollbar-width:thin] max-lg:block">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Настройки 3D вида</p>
            <p className="text-[12px] text-[#64748B]">Сохраненные виды, камера, свет и слои сцены</p>
          </div>
          <button type="button" onClick={saveView} className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/70 bg-white/60 text-lg text-[#229ED9]">
            +
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <CompactMetric label="Здания" value={modelStats.buildings} />
          <CompactMetric label="Дороги" value={modelStats.roads} />
          <CompactMetric label="POI" value={modelStats.poi} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Toggle label="Белая модель" checked={settings.activeMapType === "white-model"} onChange={() => update({ activeMapType: "white-model", visualStyle: "presentation" })} />
          <Toggle label="Экструзия" checked={settings.showBuildings} onChange={(checked) => update({ showBuildings: checked })} />
          <Toggle label="Высоты" checked={settings.showHeights} onChange={(checked) => update({ showHeights: checked })} />
          <Toggle label="Рельеф" checked={terrainSettings.enabled} onChange={(checked) => updateTerrain({ enabled: checked })} />
          <Toggle label="Дороги" checked={settings.showRoads} onChange={(checked) => update({ showRoads: checked })} />
          <Toggle label="POI" checked={settings.showPoi} onChange={(checked) => update({ showPoi: checked })} />
          <Toggle label="Зоны" checked={settings.showZones} onChange={(checked) => update({ showZones: checked })} />
          <Toggle label="Вода" checked={settings.showWater} onChange={(checked) => update({ showWater: checked })} />
          <Toggle label="Озеленение" checked={settings.showVegetation} onChange={(checked) => update({ showVegetation: checked })} />
          <Toggle label="Освещение" checked={settings.shadows} onChange={(checked) => update({ shadows: checked })} />
        </div>
        <div className="mt-3 grid gap-2">
          <SelectControl
            label="Камера"
            value={settings.cameraPreset}
            onChange={(value) => applyCameraPreset(value as CameraPreset)}
            options={cameraPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
          />
          <Slider label="Вертикальное преувеличение" value={terrainSettings.exaggeration} min={0.2} max={5} step={0.1} suffix="x" onChange={(value) => updateTerrain({ exaggeration: value })} />
        </div>
      </section>
    </div>
  );
}

function withThreeDDefaults(settings: ProjectThreeDSettings): ProjectThreeDSettings {
  return {
    ...settings,
    showWater: settings.showWater ?? true,
    showVegetation: settings.showVegetation ?? true,
    showHeights: settings.showHeights ?? true,
    cameraPreset: settings.cameraPreset ?? "north-west",
    lightingTime: settings.lightingTime ?? "12:00",
    shadows: settings.shadows ?? true,
    flythroughEnabled: settings.flythroughEnabled ?? false,
    savedViews: settings.savedViews ?? [],
    screenshots: settings.screenshots ?? [],
    terrain: {
      ...settings.terrain,
      enabled: settings.terrain.enabled ?? settings.showTerrain,
      exaggeration: settings.terrain.exaggeration ?? 1,
    },
  };
}

function getSceneMap(): SceneMap | null {
  return ((window as unknown as { __formiqMap?: SceneMap }).__formiqMap ?? null);
}

function getPresetLabel(preset: CameraPreset): string {
  return cameraPresets.find((item) => item.id === preset)?.label ?? "Ракурс";
}

function formatSourceLabel(project: ReturnType<typeof useProjectStore.getState>["project"]): string {
  return project.name ? `FORMIQ / ${project.name}` : "FORMIQ";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-white/70 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid min-w-[86px] gap-1 border-r border-white/70 px-4 py-3 text-center text-[12px] font-medium transition duration-200 ease-out last:border-r-0 hover:-translate-y-0.5 hover:bg-white/65">
      <Icon name={icon} className="mx-auto text-[#0F172A]" />
      <span>{label}</span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-10 items-center justify-between gap-3 rounded-[14px] border border-white/70 bg-white/45 px-3 text-[13px] font-medium">
      <span className="truncate">{label}</span>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#229ED9]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 rounded-[14px] border border-white/70 bg-white/45 px-3 py-2 text-[13px] font-medium">
      <span className="flex items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[#64748B]">{suffix === "x" ? `${value.toFixed(1)}x` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} className="accent-[#229ED9]" onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[13px] font-medium text-[#64748B]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[14px] border border-[#CBD5E1]/80 bg-white/80 px-3 text-[#0F172A] outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-white/70 bg-white/45 px-3 py-2">
      <p className="text-[11px] text-[#64748B]">{label}</p>
      <p className="text-lg font-semibold">{value.toLocaleString("ru-RU")}</p>
    </div>
  );
}

type IconName =
  | "image"
  | "cube"
  | "blocks"
  | "cloud"
  | "pin"
  | "road"
  | "zones"
  | "target"
  | "sun"
  | "zoom"
  | "rotate"
  | "tilt"
  | "screen"
  | "play"
  | "compass";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    image: <path d="M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3M8 9h.01" />,
    cube: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5-8-4.5" />,
    blocks: <path d="M4 20V9l5-3 5 3v11M14 20V7l3-2 3 2v13M8 20v-6" />,
    cloud: <path d="M6 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.3-2A5 5 0 0 0 6 18Z" />,
    pin: <path d="M12 21s6-5.4 6-11a6 6 0 0 0-12 0c0 5.6 6 11 6 11Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    road: <path d="M4 19 9 5m6 0 5 14M12 8v2m0 4v2" />,
    zones: <path d="M4 18V6l6-2 4 2 6-2v12l-6 2-4-2-6 2Zm6-14v12m4-10v12" />,
    target: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6 2 2m0-10-2 2m-6 6-2 2M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
    sun: <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m0-12.8L4.2 4.2m15.6 15.6-1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
    zoom: <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 5 5M11 8v6m-3-3h6" />,
    rotate: <path d="M4 12a8 8 0 0 1 13-6l2 2m1-5v5h-5M20 12a8 8 0 0 1-13 6l-2-2m-1 5v-5h5" />,
    tilt: <path d="M4 16 20 8M7 18h10M7 6h10" />,
    screen: <path d="M4 5h16v12H4zM9 21h6m-3-4v4" />,
    play: <path d="M8 5v14l11-7-11-7Z" />,
    compass: <path d="M12 2 7 22l5-4 5 4-5-20Z" />,
  };

  return (
    <svg className={`h-4 w-4 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

interface SceneMap {
  easeTo: (options: { pitch?: number; bearing?: number; zoom?: number; duration?: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getZoom: () => number;
  getBearing: () => number;
}
