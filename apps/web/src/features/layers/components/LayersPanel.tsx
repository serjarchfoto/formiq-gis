"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { CartographicStyleEngine, ThematicMapEngine, type ThematicMapType } from "@/lib";
import { useLayers } from "@/store/layers";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { CartographicThemeId, RoadWidthMode } from "@/types/formiq";

const text = {
  layers: "\u0421\u043b\u043e\u0438",
  addLayer: "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u043b\u043e\u0439",
  importLayer: "\u0418\u043c\u043f\u043e\u0440\u0442 \u0441\u043b\u043e\u044f",
  chooseFile: "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 GeoJSON, KML, GPX \u0438\u043b\u0438 Shapefile",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  import: "\u0418\u043c\u043f\u043e\u0440\u0442",
  visible: "\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c",
  opacity: "\u041f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c",
  up: "\u0412\u044b\u0448\u0435",
  down: "\u041d\u0438\u0436\u0435",
  remove: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c",
  locked: "\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0439",
  cartographicStyle: "\u041a\u0430\u0440\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0441\u0442\u0438\u043b\u044c",
  roadWidth: "\u0428\u0438\u0440\u0438\u043d\u0430 \u0434\u043e\u0440\u043e\u0433",
  roadCasings: "\u041e\u0431\u0432\u043e\u0434\u043a\u0430 \u0434\u043e\u0440\u043e\u0433",
  analysisOpacity: "\u041f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c \u0430\u043d\u0430\u043b\u0438\u0437\u0430",
  thematicMap: "\u0422\u0435\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043a\u0430\u0440\u0442\u0430",
  none: "\u041d\u0435\u0442",
  importError: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0444\u0430\u0439\u043b.",
};

const thematicMapOptions = new ThematicMapEngine().getOptions();
const cartographicThemeOptions = new CartographicStyleEngine().getThemeOptions();

export default function LayersPanel() {
  const {
    layers,
    toggleLayer,
    setLayerOpacity,
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setImportError("");
  };

  const handleImportLayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      return;
    }

    try {
      await addLayer(selectedFile);
      setSelectedFile(null);
      setIsImportDialogOpen(false);
    } catch {
      setImportError(text.importError);
    }
  };

  return (
    <aside className="absolute left-6 top-6 z-20 max-h-[calc(100%-3rem)] w-[22rem] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{text.layers}</h2>
        <button
          type="button"
          data-testid="add-layer-button"
          onClick={() => setIsImportDialogOpen(true)}
          className="h-9 rounded-lg bg-[#229ED9] px-3 text-xs font-semibold text-white hover:bg-[#1D8CC2]"
        >
          {text.addLayer}
        </button>
      </div>

      <div className="space-y-3" data-testid="layers-list">
        {orderedLayers.map((layer, index) => (
          <section
            key={layer.id}
            data-testid={`layer-row-${layer.id}`}
            className="rounded-xl border border-[#E5E7EB] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  data-testid={`layer-visible-${layer.id}`}
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleLayer(layer.id)}
                  className="h-5 w-5 shrink-0 accent-[#229ED9]"
                />
                <span className="truncate text-sm font-semibold text-[#111827]">{layer.name}</span>
              </label>
              <span className="shrink-0 rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#64748B]">
                {layer.removable ? layer.sourceType : text.locked}
              </span>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 flex justify-between text-xs text-[#64748B]">
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
                onChange={(event) => setLayerOpacity(layer.id, Number(event.target.value))}
                className="w-full accent-[#229ED9]"
              />
            </label>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveLayer(layer.id, -1)}
                className="h-8 rounded-lg border border-[#D1D5DB] text-xs font-semibold text-[#374151] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {text.up}
              </button>
              <button
                type="button"
                disabled={index === orderedLayers.length - 1}
                onClick={() => moveLayer(layer.id, 1)}
                className="h-8 rounded-lg border border-[#D1D5DB] text-xs font-semibold text-[#374151] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {text.down}
              </button>
              <button
                type="button"
                data-testid={`remove-layer-${layer.id}`}
                disabled={!layer.removable}
                onClick={() => removeLayer(layer.id)}
                className="h-8 rounded-lg border border-[#FCA5A5] text-xs font-semibold text-[#B91C1C] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:text-[#9CA3AF]"
              >
                {text.remove}
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-[#E5E7EB] pt-4">
        <ControlLabel title={text.cartographicStyle}>
          <select
            value={project.settings.display.cartographicTheme}
            onChange={(event) =>
              setMapDisplaySettings({ cartographicTheme: event.target.value as CartographicThemeId })
            }
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9]"
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
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9]"
          >
            <option value="class-based">class-based</option>
            <option value="real-width">real-width</option>
            <option value="custom">custom</option>
          </select>
        </ControlLabel>

        <label className="flex items-center justify-between rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-[#374151]">
          <span>{text.roadCasings}</span>
          <input
            type="checkbox"
            checked={project.settings.display.showRoadCasings}
            onChange={(event) => setMapDisplaySettings({ showRoadCasings: event.target.checked })}
            className="h-5 w-5 accent-[#229ED9]"
          />
        </label>

        <ControlLabel title={text.analysisOpacity}>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={project.settings.display.analysisLayerOpacity}
            onChange={(event) =>
              setMapDisplaySettings({ analysisLayerOpacity: Number(event.target.value) })
            }
            className="w-full accent-[#229ED9]"
          />
        </ControlLabel>

        <ControlLabel title={text.thematicMap}>
          <select
            value={project.settings.display.activeThematicMapType}
            onChange={(event) => setThematicMapType(event.target.value as ThematicMapType)}
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9]"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4"
          role="dialog"
          aria-modal="true"
          data-testid="layer-import-dialog"
        >
          <form onSubmit={handleImportLayer} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{text.importLayer}</h3>
            <p className="mt-2 text-sm text-[#64748B]">{text.chooseFile}</p>

            <input
              data-testid="layer-file-input"
              type="file"
              accept=".geojson,.json,.kml,.gpx,.zip,.shp"
              onChange={handleFileChange}
              className="mt-5 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
            />

            {importError ? (
              <p className="mt-3 text-sm font-medium text-[#DC2626]">{importError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportDialogOpen(false)}
                className="h-10 rounded-lg border border-[#D1D5DB] px-4 text-sm font-semibold"
              >
                {text.cancel}
              </button>
              <button
                type="submit"
                data-testid="layer-import-submit"
                disabled={!selectedFile}
                className="h-10 rounded-lg bg-[#229ED9] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#93C5FD]"
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

function ControlLabel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#6B7280]">{title}</span>
      {children}
    </label>
  );
}
