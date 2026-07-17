import { AnalysisIcon } from "./AnalysisIcon";

interface MapControlApi {
  zoomIn: (options?: { duration?: number }) => void;
  zoomOut: (options?: { duration?: number }) => void;
}

export function AnalysisMapControls({ viewMode, onViewModeChange, onCenterMap }: { viewMode: "2d" | "3d"; onViewModeChange: (mode: "2d" | "3d") => void; onCenterMap: () => void }) {
  const withMap = (action: (map: MapControlApi) => void) => {
    const map = (window as unknown as { __formiqMap?: MapControlApi }).__formiqMap;
    if (map) action(map);
  };

  return (
    <div className="absolute left-[408px] top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-3 lg:flex" aria-label="Управление картой">
      <button type="button" aria-label="Центрировать карту" onClick={onCenterMap} className="grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/76 text-[#334155] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5">
        <AnalysisIcon name="map" className="h-[18px] w-[18px]" />
      </button>
      <div className="flex w-11 flex-col overflow-hidden rounded-[16px] border border-white/70 bg-white/76 backdrop-blur-3xl">
        <ControlButton label="Увеличить масштаб" onClick={() => withMap((map) => map.zoomIn({ duration: 260 }))}><AnalysisIcon name="plus" className="h-[18px] w-[18px]" /></ControlButton>
        <ControlButton label="Уменьшить масштаб" onClick={() => withMap((map) => map.zoomOut({ duration: 260 }))}><AnalysisIcon name="minus" className="h-[18px] w-[18px]" /></ControlButton>
        <ControlButton label={viewMode === "3d" ? "Перейти в 2D" : "Перейти в 3D"} onClick={() => onViewModeChange(viewMode === "3d" ? "2d" : "3d")}><span className="text-[11px] font-semibold">3D</span></ControlButton>
        <ControlButton label="Показать проект целиком" onClick={onCenterMap}><AnalysisIcon name="sliders" className="h-[17px] w-[17px]" /></ControlButton>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-11 place-items-center border-b border-[#E2E8F0]/70 text-[#475569] transition duration-200 ease-out last:border-b-0 hover:bg-white/75 hover:text-[#229ED9]">{children}</button>;
}
