"use client";

import type { ThreeDTerrainSummary } from "@/lib";
import type { ThreeDMapLegendItem } from "@/types/formiq";

interface ThreeDLegendProps {
  title: string;
  items: ThreeDMapLegendItem[];
  sourceLabel?: string;
  dateLabel?: string;
  presentation?: boolean;
  terrainSummary?: ThreeDTerrainSummary | null;
}

export default function ThreeDLegend({
  title,
  items,
  sourceLabel = "FORMIQ",
  dateLabel = "",
  presentation = false,
  terrainSummary = null,
}: ThreeDLegendProps) {
  if (!items.length) {
    return (
      <section className="rounded-[16px] border border-white/70 bg-white/45 p-3 text-xs text-[#64748B]">
        Легенда появится после появления объектов в текущей модели.
      </section>
    );
  }

  return (
    <section
      className={
        presentation
          ? "rounded-[16px] border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur-2xl"
          : "rounded-[16px] border border-white/70 bg-white/45 p-3 backdrop-blur-2xl"
      }
    >
      <div className="border-b border-white/70 pb-2">
        <h3 className="truncate text-sm font-bold text-[#0F172A]">{title}</h3>
        {presentation ? (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-[#64748B]">3D аксонометрическая сцена</p>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5">
        {items
          .filter((item) => (item.count ?? 1) > 0)
          .slice(0, presentation ? 10 : 14)
          .map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-[#334155]">{item.label}</span>
              </span>
              <span className="shrink-0 font-semibold text-[#0F172A]">{formatLegendValue(item)}</span>
            </div>
          ))}
      </div>

      {presentation ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/70 pt-2 text-[10px] text-[#64748B]">
          <Meta label="Источник" value={sourceLabel} />
          <Meta label="Дата" value={dateLabel} />
          {terrainSummary ? (
            <>
              <Meta label="Рельеф" value={formatTerrainSource(terrainSummary.source)} />
              <Meta label="Высоты" value={`${Math.round(terrainSummary.minElevation)}-${Math.round(terrainSummary.maxElevation)} м`} />
              {terrainSummary.exaggeration !== 1 ? (
                <Meta label="Преувеличение" value={`x${terrainSummary.exaggeration.toFixed(1)}`} />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="uppercase tracking-wide">{label}</p>
      <p className="truncate font-semibold text-[#334155]">{value}</p>
    </div>
  );
}

function formatTerrainSource(source: string): string {
  const labels: Record<string, string> = {
    "copernicus-dem": "Copernicus DEM",
    opentopography: "OpenTopography",
    "mapbox-terrain-rgb": "Mapbox Terrain RGB",
    "local-heightmap": "Local Heightmap",
    "local-mesh": "Local Mesh",
    none: "нет",
  };

  return labels[source] ?? source;
}

function formatLegendValue(item: ThreeDMapLegendItem): string {
  if (typeof item.length === "number" && item.length > 0) {
    return item.length >= 1_000 ? `${(item.length / 1_000).toFixed(1)} км` : `${Math.round(item.length)} м`;
  }

  if (typeof item.area === "number" && item.area > 0) {
    return item.area >= 1_000_000
      ? `${(item.area / 1_000_000).toFixed(1)} км²`
      : `${Math.round(item.area).toLocaleString("ru-RU")} м²`;
  }

  return typeof item.count === "number" ? item.count.toLocaleString("ru-RU") : "";
}
