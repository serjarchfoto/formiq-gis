"use client";

import type { ReactNode } from "react";
import { useSelectionStore } from "@/store/selection";

export default function SelectionToolbar() {
  const mode = useSelectionStore((state) => state.mode);
  const selection = useSelectionStore((state) => state.selection);
  const draftCoordinates = useSelectionStore((state) => state.draftCoordinates);
  const setMode = useSelectionStore((state) => state.setMode);
  const commitPolygon = useSelectionStore((state) => state.commitPolygon);
  const switchSelectionShape = useSelectionStore((state) => state.switchSelectionShape);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const hasPolygonDraft = mode === "polygon" && draftCoordinates.length >= 3;

  return (
    <aside className="absolute left-1/2 top-[168px] z-30 w-[440px] -translate-x-1/2 rounded-[20px] border border-white/70 bg-white/70 p-3 backdrop-blur-3xl max-md:left-4 max-md:right-4 max-md:top-[156px] max-md:w-auto max-md:translate-x-0">
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
        <ToolButton
          active={mode === "rectangle" || selection?.shape === "rectangle"}
          label="Выбор территории"
          icon="select"
          onClick={() =>
            selection
              ? switchSelectionShape("rectangle")
              : setMode(mode === "rectangle" ? "none" : "rectangle")
          }
        />
        <ToolButton
          active={mode === "polygon" || selection?.shape === "polygon"}
          label="Полигон"
          icon="polygon"
          onClick={() =>
            selection
              ? switchSelectionShape("polygon")
              : setMode(mode === "polygon" ? "none" : "polygon")
          }
        />
        <ToolButton
          disabled={!hasPolygonDraft}
          label="Завершить"
          icon="check"
          onClick={commitPolygon}
        />
        <ToolButton
          disabled={!selection && draftCoordinates.length === 0 && mode === "none"}
          label="Очистить"
          icon="x"
          onClick={clearSelection}
        />
      </div>
      <p className="mt-2 px-2 text-[12px] text-[#64748B]">
        {selection
          ? "Территория выбрана. Перетаскивайте контур или вершины на карте."
          : mode === "rectangle"
            ? "Зажмите и протяните область на карте."
            : mode === "polygon"
              ? "Кликайте точки контура, затем завершите полигон."
              : "Выберите прямоугольник или полигон."}
      </p>
    </aside>
  );
}

function ToolButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-[14px] text-[12px] font-medium transition duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-[#229ED9] text-white" : "bg-white/55 text-[#0F172A]"
      }`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

type IconName = "check" | "polygon" | "select" | "x";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    check: <path d="m5 12 4 4L19 6" />,
    polygon: <path d="m6 5 9-2 5 7-4 9H7l-4-7 3-7Z" />,
    select: <path d="M5 5h14v14H5zM9 9h6v6H9z" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
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
