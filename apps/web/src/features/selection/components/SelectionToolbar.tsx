"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { SpatialImportPipeline, type SpatialImportFormat } from "@/features/import/spatial-import";
import { createSelectionFromTerritory, createTerritorySelection } from "@/features/selection/selectionGeometry";
import { calculateSelectionStats } from "@/features/selection/selectionStats";
import { AreaService } from "@/features/selection/areaService";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";

export default function SelectionToolbar() {
  const mode = useSelectionStore((state) => state.mode);
  const selection = useSelectionStore((state) => state.selection);
  const draft = useSelectionStore((state) => state.draftCoordinates);
  const setMode = useSelectionStore((state) => state.setMode);
  const commitPolygon = useSelectionStore((state) => state.commitPolygon);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const project = useProjectStore((state) => state.project);
  const createTerritory = useProjectStore((state) => state.createTerritoryFromSelection);
  const unlockAndResetTerritory = useProjectStore((state) => state.unlockAndResetTerritory);
  const setDraftCoordinates = useSelectionStore((state) => state.setDraftCoordinates);
  const undo = useSelectionStore((state) => state.undo);
  const redo = useSelectionStore((state) => state.redo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const stats = selection ? calculateSelectionStats(selection, project) : null;
  const validation = AreaService.validate(selection);
  const active = Boolean(selection);

  const useProjectArea = () => {
    const existing = project.territories.find((territory) => territory.id === project.activeTerritoryId);
    if (existing) {
      useSelectionStore.getState().setSelectionPreview(createSelectionFromTerritory(existing));
      return;
    }
    const bounds = project.metadata.bounds;
    if (!bounds) return;
    createTerritory(createTerritorySelection([[bounds.west, bounds.south], [bounds.east, bounds.south], [bounds.east, bounds.north], [bounds.west, bounds.north], [bounds.west, bounds.south]], "rectangle"), "Весь проект");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "wkt" || ext === "gpx") {
        const text = await file.text();
        const coordinates = ext === "wkt" ? parseWktPolygon(text) : parseGpxTrack(text);
        if (coordinates.length < 3) throw new Error("Файл не содержит корректный полигон");
        createTerritory(createTerritorySelection(coordinates, "polygon"), file.name.replace(/\.[^.]+$/, ""));
        setError("");
        return;
      }
      const format: SpatialImportFormat = ext === "kml" ? "kml" : ext === "zip" || ext === "shp" ? "shapefile" : "geojson";
      const payload = format === "shapefile" ? await file.arrayBuffer() : await file.text();
      const result = await new SpatialImportPipeline().run([{ id: `territory-${Date.now()}`, name: file.name, format, payload, fileName: file.name }]);
      const geometry = result.datasets.flatMap((dataset) => dataset.layers.flatMap((layer) => layer.featureCollection.features)).find((feature) => feature.geometry.type === "Polygon");
      if (!geometry || geometry.geometry.type !== "Polygon") throw new Error("Файл не содержит полигон территории");
      createTerritory(createTerritorySelection(geometry.geometry.coordinates[0], "polygon"), file.name.replace(/\.[^.]+$/, ""));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось импортировать границу");
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z") { event.preventDefault(); redo(); return; }
      if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
      if (mode !== "polygon") return;
      if (event.key === "Enter" && draft.length >= 3) { event.preventDefault(); commitPolygon(); }
      if (event.key === "Backspace" && draft.length) { event.preventDefault(); setDraftCoordinates(draft.slice(0, -1)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitPolygon, draft, mode, redo, setDraftCoordinates, undo]);

  return (
    <section className="shrink-0 border-b border-white/70 bg-white/55 p-3" data-testid="area-selection-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div><p className="text-sm font-semibold text-[#0F172A]">Территория</p><p className="text-[11px] text-[#64748B]">{active ? "Выбрана и готова к импорту" : "Выберите область для работы"}</p></div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-[#DCFCE7] text-[#15803D]" : "bg-white/70 text-[#64748B]"}`}>{active ? "Выбрана" : "Не выбрана"}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton active={mode === "rectangle" || selection?.shape === "rectangle"} label="Прямоугольник" icon="select" onClick={() => setMode(mode === "rectangle" ? "none" : "rectangle")} />
        <ToolButton active={mode === "polygon" || selection?.shape === "polygon"} label="Полигон" icon="polygon" onClick={() => setMode(mode === "polygon" ? "none" : "polygon")} />
        <ToolButton label="Весь проект" icon="globe" onClick={useProjectArea} />
        <ToolButton label="Импорт границы" icon="upload" onClick={() => fileRef.current?.click()} />
      </div>
      <input ref={fileRef} hidden type="file" accept=".geojson,.json,.kml,.gpx,.wkt,.zip,.shp" onChange={handleFile} />
      {mode === "polygon" && draft.length >= 3 ? <button type="button" onClick={commitPolygon} className="mt-2 h-9 w-full rounded-[12px] bg-[#229ED9] text-xs font-semibold text-white">Завершить полигон (или двойной клик)</button> : null}
      {selection ? <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/70 pt-2 text-[11px] text-[#475569]"><span>Площадь <b>{stats?.areaKm2.toFixed(2)} км²</b></span><span>Периметр <b>{stats?.perimeterKm.toFixed(2)} км</b></span><span>Здания <b>{stats?.counts.buildings}</b></span><span>Дороги <b>{stats?.counts.roads}</b></span><span>Зелень <b>{stats?.counts.vegetation}</b></span><span>Вода <b>{stats?.counts.water}</b></span><span>Центр <b>{stats?.center.map((value) => value.toFixed(4)).join(", ")}</b></span><span>Импорт <b>{stats?.counts.imported}</b></span></div> : null}
      {selection ? <p className={`mt-2 rounded-[10px] px-2 py-1 text-[11px] ${validation.valid ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#B91C1C]"}`}>{validation.message}</p> : null}
      {error ? <p className="mt-2 text-[11px] font-medium text-[#EF4444]">{error}</p> : null}
      <p className="mt-2 text-[11px] text-[#64748B]">{selection ? "Перетаскивайте контур и вершины на карте." : mode === "rectangle" ? "Зажмите и протяните область на карте." : mode === "polygon" ? "Кликайте вершины; двойной клик завершает полигон." : "Выберите прямоугольник, полигон или файл."}</p>
      {selection ? <div className="mt-2 grid grid-cols-2 gap-1.5"><button type="button" onClick={async () => { await unlockAndResetTerritory(); setMode(selection.shape); }} className="h-8 rounded-[12px] border border-white/70 bg-white/60 text-[11px] font-semibold">Изменить</button><button type="button" onClick={clearSelection} className="h-8 rounded-[12px] border border-white/70 bg-white/60 text-[11px] font-semibold text-[#EF4444]">Сбросить</button></div> : null}
    </section>
  );
}

function ToolButton({ active, label, icon, onClick }: { active?: boolean; label: string; icon: IconName; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-11 items-center justify-center gap-1 rounded-[12px] px-1 text-[11px] font-medium transition hover:-translate-y-0.5 ${active ? "bg-[#229ED9] text-white" : "bg-white/60 text-[#0F172A]"}`}><Icon name={icon} />{label}</button>;
}

type IconName = "globe" | "polygon" | "select" | "upload";
function Icon({ name }: { name: IconName }) { const paths: Record<IconName, ReactNode> = { globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>, polygon: <path d="m6 5 9-2 5 7-4 9H7l-4-7 3-7Z"/>, select: <path d="M5 5h14v14H5zM9 9h6v6H9z"/>, upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M5 14v5h14v-5"/></> }; return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</svg>; }

function parseWktPolygon(text: string) {
  const body = text.match(/POLYGON\s*\(\((.+)\)\)/i)?.[1];
  if (!body) return [];
  return body.split(",").map((pair) => pair.trim().split(/\s+/).map(Number)).filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1])) as [number, number][];
}

function parseGpxTrack(text: string) {
  return Array.from(text.matchAll(/<trkpt[^>]*lat="([\d.-]+)"[^>]*lon="([\d.-]+)"/gi)).map((match) => [Number(match[2]), Number(match[1])] as [number, number]);
}
