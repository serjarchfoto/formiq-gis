"use client";

import type { Position } from "geojson";
import { getCachedAnalysisResult, isThematicMapDefinition } from "@/lib";
import { useMapStore } from "@/store/map";
import { useProjectStore } from "@/store/project";
import { useSelectionStore } from "@/store/selection";
import { calculateLineLength, calculatePolygonArea } from "@/utils";

export default function CartographicLayoutOverlay() {
  const project = useProjectStore((state) => state.project);
  const thematicMapType = project.settings.display.activeThematicMapType;
  const selection = useSelectionStore((state) => state.selection);
  const cursorCoordinates = useMapStore((state) => state.cursorCoordinates);
  const scaleLabel = useMapStore((state) => state.scaleLabel);
  const measurementMode = useMapStore((state) => state.measurementMode);
  const measurementPoints = useMapStore((state) => state.measurementPoints);
  const selectedObject = useMapStore((state) => state.selectedObject);
  const setMeasurementMode = useMapStore((state) => state.setMeasurementMode);
  const clearMeasurement = useMapStore((state) => state.clearMeasurement);
  const cachedThematicMap = project.thematicMaps[thematicMapType];
  const thematicMap = isThematicMapDefinition(cachedThematicMap) ? cachedThematicMap : null;
  const analysis = getCachedAnalysisResult(project);
  const sourceLabel = project.dataSources
    .filter((source) => source.status === "active" && (source.featureCount ?? 0) > 0)
    .map((source) => source.name)
    .slice(0, 3)
    .join(", ");
  const territoryArea = selection
    ? calculatePolygonArea({
        type: "polygon",
        rings: selection.geometry.geometry.coordinates,
      })
    : (analysis?.territory.area ?? 0);
  const measurementLabel = getMeasurementLabel(measurementMode, measurementPoints);

  if (!thematicMap && !cursorCoordinates && !selectedObject && measurementMode === "none") {
    return null;
  }

  return (
    <>
      {thematicMap && (
        <aside className="absolute bottom-6 left-6 z-20 w-80 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[#111827]">{thematicMap.title}</h2>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">{thematicMap.description}</p>
          </div>

          <div className="space-y-2">
            {thematicMap.legend
              .filter((item) => item.count > 0)
              .map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-sm text-[#374151]">{item.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-[#111827]">
                    {item.count.toLocaleString("ru-RU")}
                  </span>
                </div>
              ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#6B7280]">
            <Meta label="Площадь" value={formatArea(territoryArea)} />
            <Meta label="Источник" value={sourceLabel || "FORMIQ"} />
            <Meta label="Проект" value={project.name} />
            <Meta label="Дата" value={new Date().toLocaleDateString("ru-RU")} />
          </div>
        </aside>
      )}

      <aside className="absolute bottom-6 left-1/2 z-20 w-80 -translate-x-1/2 rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-xl">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => setMeasurementMode("distance")}
            className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
              measurementMode === "distance"
                ? "border-[#229ED9] bg-[#229ED9] text-white"
                : "border-[#E5E7EB] hover:bg-[#F8FAFC]"
            }`}
          >
            Длина
          </button>
          <button
            onClick={() => setMeasurementMode("area")}
            className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
              measurementMode === "area"
                ? "border-[#229ED9] bg-[#229ED9] text-white"
                : "border-[#E5E7EB] hover:bg-[#F8FAFC]"
            }`}
          >
            Площадь
          </button>
          <button
            onClick={clearMeasurement}
            className="rounded-xl border border-[#E5E7EB] px-2 py-2 text-xs font-medium transition hover:bg-[#F8FAFC]"
          >
            Сброс
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-[#6B7280]">
          <Meta
            label="Координаты"
            value={
              cursorCoordinates
                ? `${cursorCoordinates.latitude.toFixed(5)}, ${cursorCoordinates.longitude.toFixed(5)}`
                : "-"
            }
          />
          <Meta label="Масштаб" value={scaleLabel} />
          <Meta label="Измерение" value={measurementLabel} />
          <Meta label="Север" value="↑ N" />
        </div>
      </aside>

      {selectedObject && (
        <aside className="absolute right-6 bottom-6 z-20 w-72 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
          <h2 className="mb-3 text-lg font-bold text-[#111827]">Объект</h2>
          <div className="space-y-2 text-sm">
            <Meta label="ID" value={selectedObject.id} />
            <Meta label="Тип" value={selectedObject.type} />
            <Meta label="Категория" value={selectedObject.category} />
          </div>
        </aside>
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] px-3 py-2">
      <p className="text-[11px] text-[#9CA3AF]">{label}</p>
      <p className="truncate text-xs font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function getMeasurementLabel(mode: string, points: Position[]): string {
  if (mode === "distance" && points.length > 1) {
    return formatLength(calculateLineLength({ type: "line", coordinates: points }));
  }

  if (mode === "area" && points.length > 2) {
    const ring = closeRing(points);
    return formatArea(calculatePolygonArea({ type: "polygon", rings: [ring] }));
  }

  return mode === "none" ? "-" : "Кликните точки";
}

function closeRing(points: Position[]): Position[] {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) {
    return points;
  }

  return [...points, first];
}

function formatLength(valueM: number): string {
  if (valueM >= 1_000) {
    return `${(valueM / 1_000).toFixed(2)} км`;
  }

  return `${Math.round(valueM).toLocaleString("ru-RU")} м`;
}

function formatArea(valueSqM: number): string {
  if (valueSqM >= 1_000_000) {
    return `${(valueSqM / 1_000_000).toFixed(2)} км²`;
  }

  return `${Math.round(valueSqM).toLocaleString("ru-RU")} м²`;
}
