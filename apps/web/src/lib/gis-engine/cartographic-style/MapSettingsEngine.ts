import type { FormiqProjectData, ProjectDisplaySettings } from "@/types/formiq";
import type { MapStyleSettings } from "./types";

export class MapSettingsEngine {
  resolveStyleSettings(project: FormiqProjectData): MapStyleSettings {
    return {
      themeId: project.settings.display.cartographicTheme,
      roadWidthMode: project.settings.display.roadWidthMode,
      customRoadWidthMultiplier: project.settings.display.customRoadWidthMultiplier,
      showRoadCasings: project.settings.display.showRoadCasings,
    };
  }

  updateDisplaySettings(
    project: FormiqProjectData,
    patch: Partial<ProjectDisplaySettings>
  ): FormiqProjectData {
    return {
      ...project,
      settings: {
        ...project.settings,
        display: {
          ...project.settings.display,
          ...patch,
        },
      },
    };
  }
}
