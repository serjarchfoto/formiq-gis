import type { ReactNode } from "react";

export type AnalysisIconName =
  | "analysis"
  | "blocks"
  | "building"
  | "chart"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "compare"
  | "eye"
  | "grid"
  | "info"
  | "layers"
  | "map"
  | "minus"
  | "plus"
  | "sliders"
  | "sun"
  | "transport";

const paths: Record<AnalysisIconName, ReactNode> = {
  analysis: <path d="M4 19V5m6 14V9m6 10V3m4 16H3" />,
  blocks: <path d="M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z" />,
  building: <path d="m4 8 8-4 8 4v10l-8 4-8-4Zm4 2v6m4-8v10m4-8v6" />,
  chart: <path d="M4 19V5m0 14h16M8 16l3-5 4 3 4-8" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "chevron-left": <path d="m14 7-5 5 5 5" />,
  "chevron-right": <path d="m10 7 5 5-5 5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  compare: <path d="M7 4v16m0-16L3 8m4-4 4 4m6 12V4m0 16-4-4m4 4 4-4" />,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  grid: <path d="M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z" />,
  info: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  layers: <path d="m12 3 9 5-9 5-9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4" />,
  map: <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14m-7-7h14" />,
  sliders: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6" />,
  sun: <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m0-12.8L4.2 4.2m15.6 15.6-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  transport: <path d="M6 17h12l1-6-2-5H7l-2 5Zm1 0-1 3m11-3 1 3M7 11h10M8 14h.01M16 14h.01" />,
};

export function AnalysisIcon({
  name,
  className = "h-5 w-5",
}: {
  name: AnalysisIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
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

export function PanelIconButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: AnalysisIconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] text-[#64748B] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/65 hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-35"
    >
      <AnalysisIcon name={icon} className="h-[18px] w-[18px]" />
    </button>
  );
}
