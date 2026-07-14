"use client";

import type { Position } from "geojson";
import { isThematicMapDefinition } from "@/lib";
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
  const sourceLabel = project.dataSources
    .filter((source) => source.status === "active" && (source.featureCount ?? 0) > 0)
    .map((source) => source.name)
    .slice(0, 3)
    .join(", ");
  const measurements = getMeasurementValues(measurementMode, measurementPoints, selection);

  return (
    <>
      {thematicMap ? (
        <aside className="absolute bottom-7 left-[360px] z-20 w-[360px] rounded-[20px] border border-white/70 bg-white/68 p-5 backdrop-blur-3xl">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#0F172A]">{thematicMap.title}</h2>
            <p className="mt-1 text-[12px] leading-5 text-[#64748B]">{thematicMap.description}</p>
          </div>

          <div className="space-y-2">
            {thematicMap.legend
              .filter((item) => item.count > 0)
              .map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-white/70 bg-white/45 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-sm text-[#334155]">{item.label}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-[#0F172A]">
                    {item.count.toLocaleString("ru-RU")}
                  </span>
                </div>
              ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Meta label="Источник" value={sourceLabel || "FORMIQ"} />
            <Meta label="Проект" value={project.name} />
          </div>
        </aside>
      ) : null}

      <aside className="absolute bottom-7 right-7 z-20 w-[300px] rounded-[20px] border border-white/70 bg-white/68 p-5 backdrop-blur-3xl">
        <h2 className="text-base font-semibold text-[#0F172A]">Измерения</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MeasureButton
            active={measurementMode === "distance"}
            label="Линия"
            onClick={() => setMeasurementMode("distance")}
          />
          <MeasureButton
            active={measurementMode === "area"}
            label="Площадь"
            onClick={() => setMeasurementMode("area")}
          />
          <MeasureButton label="Сброс" onClick={clearMeasurement} />
        </div>

        <div className="mt-4 space-y-2">
          <Metric label="Расстояние" value={measurements.distance} />
          <Metric label="Площадь" value={measurements.area} />
          <Metric label="Периметр" value={measurements.perimeter} />
        </div>
      </aside>

      <aside className="absolute bottom-7 left-7 z-20 w-[260px] rounded-[20px] border border-white/70 bg-white/68 p-4 backdrop-blur-3xl">
        <div className="grid grid-cols-2 gap-2">
          <Meta label="Масштаб" value={scaleLabel} />
          <Meta
            label="Координаты"
            value={
              cursorCoordinates
                ? `${cursorCoordinates.latitude.toFixed(5)}, ${cursorCoordinates.longitude.toFixed(5)}`
                : "-"
            }
          />
        </div>
      </aside>

      {selectedObject ? (
        <aside className="absolute right-7 top-[300px] z-20 w-[300px] rounded-[20px] border border-white/70 bg-white/68 p-5 backdrop-blur-3xl">
          <h2 className="text-base font-semibold text-[#0F172A]">Информация об объекте</h2>
          <div className="mt-4 space-y-2">
            <Metric label="ID" value={selectedObject.id} />
            <Metric label="Тип" value={selectedObject.type} />
            <Metric label="Категория" value={selectedObject.category} />
            {Object.entries(selectedObject.properties).slice(0, 6).map(([key, value]) => (
              <Metric key={key} label={key} value={String(value ?? "-")} />
            ))}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function MeasureButton({
  active,
  label,
  onClick,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-[14px] text-[12px] font-semibold transition duration-200 ease-out hover:-translate-y-0.5 ${
        active ? "bg-[#229ED9] text-white" : "border border-white/70 bg-white/50 text-[#0F172A]"
      }`}
    >
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/60 py-2 text-[13px] last:border-b-0">
      <span className="text-[#64748B]">{label}</span>
      <span className="truncate font-semibold text-[#0F172A]" title={value}>
        {value}
      </span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/70 bg-white/45 px-3 py-2">
      <p className="text-[11px] text-[#64748B]">{label}</p>
      <p className="truncate text-[12px] font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}

function getMeasurementValues(
  mode: string,
  points: Position[],
  selection: ReturnType<typeof useSelectionStore.getState>["selection"]
): { distance: string; area: string; perimeter: string } {
  const selectedRing = selection?.geometry.geometry.coordinates[0] ?? [];
  const selectedArea = selection
    ? calculatePolygonArea({ type: "polygon", rings: selection.geometry.geometry.coordinates })
    : 0;
  const selectedPerimeter =
    selectedRing.length > 1 ? calculateLineLength({ type: "line", coordinates: selectedRing }) : 0;

  if (mode === "distance" && points.length > 1) {
    return {
      distance: formatLength(calculateLineLength({ type: "line", coordinates: points })),
      area: selectedArea ? formatArea(selectedArea) : "-",
      perimeter: selectedPerimeter ? formatLength(selectedPerimeter) : "-",
    };
  }

  if (mode === "area" && points.length > 2) {
    const ring = closeRing(points);
    return {
      distance: "-",
      area: formatArea(calculatePolygonArea({ type: "polygon", rings: [ring] })),
      perimeter: formatLength(calculateLineLength({ type: "line", coordinates: ring })),
    };
  }

  return {
    distance: "-",
    area: selectedArea ? formatArea(selectedArea) : "-",
    perimeter: selectedPerimeter ? formatLength(selectedPerimeter) : "-",
  };
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
