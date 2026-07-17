import Map from "@/components/map";
import type { ThematicMapDefinition, ThematicMapType } from "@/lib";

export function AnalysisMap({
  viewMode,
  thematicMapType,
  thematicMap,
  opacity,
}: {
  viewMode: "2d" | "3d";
  thematicMapType: ThematicMapType;
  thematicMap: ThematicMapDefinition | null;
  opacity: number;
}) {
  return (
    <div className="absolute inset-0" data-analysis-map-view={viewMode}>
      <Map
        workspaceModeOverride={viewMode === "3d" ? "3d" : "analysis"}
        thematicMapTypeOverride={thematicMapType}
        thematicMapOverride={thematicMap}
        analysisLayerOpacityOverride={opacity}
        showNavigationControls={false}
      />
    </div>
  );
}
