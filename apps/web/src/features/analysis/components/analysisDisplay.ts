import type { AnalysisLayerDefinition, AnalysisProvenanceQuality } from "@/features/analysis/registry";

export function formatAnalysisDataStatus(status: AnalysisLayerDefinition["status"]): string {
  const labels: Record<AnalysisLayerDefinition["status"], string> = {
    verified: "Проверенные данные",
    derived: "Расчётные данные",
    heuristic: "Эвристическая оценка",
    demo: "Демонстрационные данные",
    partial: "Частичные данные",
    "no-data": "Нет данных",
    unsupported: "В разработке",
  };
  return labels[status];
}

export function formatAnalysisQuality(quality: AnalysisProvenanceQuality): string {
  const labels: Record<AnalysisProvenanceQuality, string> = {
    verified: "проверено",
    derived: "расчёт",
    heuristic: "эвристика",
    demo: "демо",
    unknown: "не определено",
  };
  return labels[quality];
}

export function getAnalysisStatusColor(status: AnalysisLayerDefinition["status"]): string {
  if (status === "verified" || status === "derived") return "#22C55E";
  if (status === "partial" || status === "heuristic" || status === "demo") return "#F59E0B";
  return "#94A3B8";
}

export function getMetricToneColor(tone: "primary" | "success" | "warning" | "danger" | "neutral"): string {
  if (tone === "success") return "#22C55E";
  if (tone === "warning") return "#F59E0B";
  if (tone === "danger") return "#EF4444";
  if (tone === "primary") return "#229ED9";
  return "#64748B";
}

export function formatAnalysisNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: value >= 10 ? 0 : 2,
    minimumFractionDigits: value > 0 && value < 10 ? 2 : 0,
  });
}
