import { getAnalysisScenario } from "./model";
import { getAnalysisLayerDefinition, getThematicMapTypeForAnalysisLayer } from "./registry";

export function getAnalysisExportSelection(layerId: string, scenarioId: string) {
  const layer = getAnalysisLayerDefinition(layerId);

  return {
    layer,
    thematicMapType: getThematicMapTypeForAnalysisLayer(layerId),
    scenario: getAnalysisScenario(scenarioId),
  };
}
