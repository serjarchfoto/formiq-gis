"use client";

import {
  analyzeTerritory,
  formatArea,
  formatLength,
  formatPercent,
} from "@/features/analysis/territoryAnalysis";
import { useLayers } from "@/store/layers";
import { useSelectionStore } from "@/store/selection";

export default function TerritoryAnalysisPanel() {
  const layers = useLayers((state) => state.layers);
  const selection = useSelectionStore((state) => state.selection);
  const report = analyzeTerritory(selection, layers);
  const greenRatio = report.selectedAreaSqM
    ? (report.greenAreaSqM / report.selectedAreaSqM) * 100
    : 0;
  const waterRatio = report.selectedAreaSqM
    ? (report.waterAreaSqM / report.selectedAreaSqM) * 100
    : 0;
  const buildingRatio = report.selectedAreaSqM
    ? (report.buildingFootprintSqM / report.selectedAreaSqM) * 100
    : 0;

  return (
    <aside className="absolute bottom-6 right-6 z-20 w-72 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          Анализ
        </h2>

        <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-medium text-[#6B7280]">
          v1
        </span>
      </div>

      <div className="space-y-3">
        <MetricRow label="Территория" value={formatArea(report.selectedAreaSqM)} />
        <MetricRow label="Объектов OSM" value={report.loadedFeatureCount.toLocaleString("ru-RU")} />
        <MetricRow label="Здания" value={report.buildingsCount.toLocaleString("ru-RU")} />
        <MetricRow label="Пятно застройки" value={formatPercent(buildingRatio)} />
        <MetricRow label="Дороги" value={formatLength(report.roadLengthM)} />
        <MetricRow label="Озеленение" value={formatPercent(greenRatio)} />
        <MetricRow label="Вода" value={formatPercent(waterRatio)} />
      </div>
    </aside>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] px-3 py-2">
      <span className="text-sm text-[#6B7280]">
        {label}
      </span>

      <span className="text-sm font-semibold text-[#111827]">
        {value}
      </span>
    </div>
  );
}
