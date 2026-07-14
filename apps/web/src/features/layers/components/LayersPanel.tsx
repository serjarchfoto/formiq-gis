"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { CartographicStyleEngine, ThematicMapEngine, type ThematicMapType } from "@/lib";
import { useLayers } from "@/store/layers";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { CartographicThemeId, RoadWidthMode } from "@/types/formiq";
import type { GISLayer } from "@/types/gis";

const text = {
  layers: "Слои",
  addLayer: "Добавить слой",
  importLayer: "Импорт слоя",
  chooseFile: "GeoJSON, Shapefile ZIP/SHP, DXF, CSV или GeoPackage",
  cancel: "Отмена",
  import: "Импорт",
  opacity: "Прозрачность",
  up: "Выше",
  down: "Ниже",
  remove: "Удалить",
  lock: "Блокировка",
  unlock: "Разблокировать",
  cartographicStyle: "Стиль карты",
  roadWidth: "Ширина дорог",
  roadCasings: "Обводка дорог",
  thematicMap: "Тематическая карта",
  none: "Нет",
  importError: "Не удалось импортировать файл.",
};

const thematicMapOptions = new ThematicMapEngine().getOptions();
const cartographicThemeOptions = new CartographicStyleEngine().getThemeOptions();

const groupLabels: Record<string, string> = {
  base: "Базовые слои",
  imports: "Импорт",
  buildings: "Здания",
  roads: "Дороги",
  green: "Озеленение",
  water: "Вода",
  terrain: "Рельеф",
  boundaries: "Границы",
  custom: "Пользовательские",
};

export default function LayersPanel() {
  const {
    layers,
    toggleLayer,
    setLayerOpacity,
    toggleLayerLock,
    addLayer,
    removeLayer,
    moveLayer,
  } = useLayers();
  const project = useProjectStore((state) => state.project);
  const setMapDisplaySettings = useProjectStore((state) => state.setMapDisplaySettings);
  const setThematicMapType = useUIStore((state) => state.setThematicMapType);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");
  const orderedLayers = useMemo(
    () => [...layers].sort((left, right) => left.order - right.order),
    [layers]
  );
  const groupedLayers = useMemo(() => groupLayers(orderedLayers), [orderedLayers]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setImportError("");
  };

  const handleImportLayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) return;

    try {
      await addLayer(selectedFile);
      setSelectedFile(null);
      setIsImportDialogOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : text.importError);
    }
  };

  return (
    <aside className="absolute left-6 top-6 z-20 max-h-[calc(100%-3rem)] w-[320px] overflow-y-auto rounded-[20px] border border-white/70 bg-white/62 p-5 backdrop-blur-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-[#0F172A]">{text.layers}</h2>
        <button
          type="button"
          data-testid="add-layer-button"
          onClick={() => setIsImportDialogOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#229ED9] px-3 text-[13px] font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
        >
          <Icon name="plus" />
          {text.addLayer}
        </button>
      </div>

      <div className="space-y-4" data-testid="layers-list">
        {groupedLayers.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 text-[12px] font-semibold uppercase text-[#64748B]">
              {groupLabels[group.id] ?? group.id}
            </h3>
            <div className="space-y-2">
              {group.layers.map((layer, index) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  index={index}
                  total={group.layers.length}
                  onToggle={() => toggleLayer(layer.id)}
                  onOpacity={(value) => setLayerOpacity(layer.id, value)}
                  onLock={() => toggleLayerLock(layer.id)}
                  onMove={(direction) => moveLayer(layer.id, direction)}
                  onRemove={() => removeLayer(layer.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-white/70 pt-4">
        <ControlLabel title={text.cartographicStyle}>
          <select
            value={project.settings.display.cartographicTheme}
            onChange={(event) =>
              setMapDisplaySettings({ cartographicTheme: event.target.value as CartographicThemeId })
            }
            className={selectClassName}
          >
            {cartographicThemeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </ControlLabel>

        <ControlLabel title={text.roadWidth}>
          <select
            value={project.settings.display.roadWidthMode}
            onChange={(event) =>
              setMapDisplaySettings({ roadWidthMode: event.target.value as RoadWidthMode })
            }
            className={selectClassName}
          >
            <option value="class-based">По классам</option>
            <option value="real-width">Реальная ширина</option>
            <option value="custom">Пользовательская</option>
          </select>
        </ControlLabel>

        <label className="flex items-center justify-between rounded-[14px] border border-white/70 bg-white/45 px-3 py-2 text-sm">
          <span>{text.roadCasings}</span>
          <input
            type="checkbox"
            checked={project.settings.display.showRoadCasings}
            onChange={(event) => setMapDisplaySettings({ showRoadCasings: event.target.checked })}
            className="h-5 w-5 accent-[#229ED9]"
          />
        </label>

        <ControlLabel title={text.thematicMap}>
          <select
            value={project.settings.display.activeThematicMapType}
            onChange={(event) => setThematicMapType(event.target.value as ThematicMapType)}
            className={selectClassName}
          >
            <option value="none">{text.none}</option>
            {thematicMapOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </ControlLabel>
      </div>

      {isImportDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/35 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          data-testid="layer-import-dialog"
        >
          <form
            onSubmit={handleImportLayer}
            className="w-full max-w-md rounded-[20px] border border-white/70 bg-white/78 p-6 backdrop-blur-3xl"
          >
            <h3 className="text-2xl font-semibold text-[#0F172A]">{text.importLayer}</h3>
            <p className="mt-2 text-sm text-[#64748B]">{text.chooseFile}</p>

            <input
              data-testid="layer-file-input"
              type="file"
              accept=".geojson,.json,.zip,.shp,.dxf,.csv,.gpkg,.geopackage"
              onChange={handleFileChange}
              className="mt-5 w-full rounded-[14px] border border-white/70 bg-white/62 px-3 py-3 text-sm"
            />

            {importError ? <p className="mt-3 text-sm font-medium text-[#EF4444]">{importError}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportDialogOpen(false)}
                className="h-11 rounded-[14px] border border-white/70 bg-white/62 px-4 text-sm font-semibold"
              >
                {text.cancel}
              </button>
              <button
                type="submit"
                data-testid="layer-import-submit"
                disabled={!selectedFile}
                className="h-11 rounded-[14px] bg-[#229ED9] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text.import}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
}

function LayerRow({
  layer,
  index,
  total,
  onToggle,
  onOpacity,
  onLock,
  onMove,
  onRemove,
}: {
  layer: GISLayer;
  index: number;
  total: number;
  onToggle: () => void;
  onOpacity: (value: number) => void;
  onLock: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <section
      data-testid={`layer-row-${layer.id}`}
      className="rounded-[16px] border border-white/70 bg-white/45 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-testid={`layer-visible-${layer.id}`}
          onClick={onToggle}
          className={`grid h-8 w-8 place-items-center rounded-[12px] border border-white/70 ${
            layer.visible ? "bg-[#229ED9] text-white" : "bg-white/50 text-[#64748B]"
          }`}
          aria-label="Видимость слоя"
        >
          <Icon name="eye" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#0F172A]">{layer.name}</p>
          <p className="mt-1 text-[12px] text-[#64748B]">{layer.sourceType}</p>
        </div>
        <button
          type="button"
          onClick={onLock}
          className={`grid h-8 w-8 place-items-center rounded-[12px] border border-white/70 ${
            layer.locked ? "bg-[#0F172A] text-white" : "bg-white/50 text-[#64748B]"
          }`}
          aria-label={layer.locked ? text.unlock : text.lock}
        >
          <Icon name={layer.locked ? "lock" : "unlock"} />
        </button>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex justify-between text-[12px] text-[#64748B]">
          <span>{text.opacity}</span>
          <span>{Math.round(layer.opacity * 100)}%</span>
        </span>
        <input
          data-testid={`layer-opacity-${layer.id}`}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          disabled={layer.locked}
          onChange={(event) => onOpacity(Number(event.target.value))}
          className="w-full accent-[#229ED9] disabled:opacity-40"
        />
      </label>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <SmallButton disabled={layer.locked || index === 0} onClick={() => onMove(-1)}>
          {text.up}
        </SmallButton>
        <SmallButton disabled={layer.locked || index === total - 1} onClick={() => onMove(1)}>
          {text.down}
        </SmallButton>
        <SmallButton danger disabled={!layer.removable || layer.locked} onClick={onRemove}>
          {text.remove}
        </SmallButton>
      </div>
    </section>
  );
}

function ControlLabel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-[#64748B]">{title}</span>
      {children}
    </label>
  );
}

function SmallButton({
  danger,
  disabled,
  children,
  onClick,
}: {
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 rounded-[12px] border border-white/70 bg-white/50 text-[12px] font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-[#EF4444]" : "text-[#0F172A]"
      }`}
    >
      {children}
    </button>
  );
}

type IconName = "eye" | "lock" | "plus" | "unlock";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    eye: <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    lock: <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    unlock: <path d="M7 11V8a5 5 0 0 1 9.5-2.2M6 11h12v10H6z" />,
  };

  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function groupLayers(layers: GISLayer[]): Array<{ id: string; layers: GISLayer[] }> {
  const groups = new Map<string, GISLayer[]>();

  layers.forEach((layer) => {
    const groupId = layer.groupId ?? (layer.category === "custom" ? "imports" : layer.category);
    groups.set(groupId, [...(groups.get(groupId) ?? []), layer]);
  });

  return Array.from(groups.entries()).map(([id, groupLayers]) => ({ id, layers: groupLayers }));
}

const selectClassName =
  "h-10 w-full rounded-[14px] border border-white/70 bg-white/62 px-3 text-sm outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60";
