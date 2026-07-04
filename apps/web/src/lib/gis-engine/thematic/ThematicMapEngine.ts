import type { AnalysisResult } from "@/lib/gis-engine/analysis";
import type { FormiqProjectData } from "@/types/formiq";
import { AccessibilityThemeGenerator } from "./generators/AccessibilityThemeGenerator";
import { AgeThemeGenerator } from "./generators/AgeThemeGenerator";
import { FloorThemeGenerator } from "./generators/FloorThemeGenerator";
import { FunctionThemeGenerator } from "./generators/FunctionThemeGenerator";
import { DensityThemeGenerator } from "./generators/DensityThemeGenerator";
import { RoadThemeGenerator } from "./generators/RoadThemeGenerator";
import { TerrainThemeGenerator } from "./generators/TerrainThemeGenerator";
import { VegetationThemeGenerator } from "./generators/VegetationThemeGenerator";
import { WaterThemeGenerator } from "./generators/WaterThemeGenerator";
import { ThemeRegistry } from "./ThemeRegistry";
import type { IThematicLayer, ThematicMapDefinition, ThematicMapType } from "./types";

export class ThematicMapEngine {
  constructor(private readonly registry = createDefaultThemeRegistry()) {}

  generate(
    type: ThematicMapType,
    project: FormiqProjectData,
    analysis: AnalysisResult
  ): ThematicMapDefinition | null {
    if (type === "none") {
      return null;
    }

    const generator = this.registry.get(type);

    if (!generator) {
      return null;
    }

    return generator.build({
      project,
      analysis,
    });
  }

  generateAll(
    project: FormiqProjectData,
    analysis: AnalysisResult
  ): Record<string, ThematicMapDefinition> {
    return Object.fromEntries(
      this.registry
        .getAll()
        .map((generator) => [generator.id, generator.build({ project, analysis })])
    );
  }

  getCached(
    type: ThematicMapType,
    project: Pick<FormiqProjectData, "thematicMaps">
  ): ThematicMapDefinition | null {
    if (type === "none") {
      return null;
    }

    return isThematicMapDefinition(project.thematicMaps[type])
      ? project.thematicMaps[type]
      : null;
  }

  getAvailableLayers(): IThematicLayer[] {
    return this.registry.getAll();
  }

  getOptions(): Array<{ id: string; title: string }> {
    return this.registry.getOptions();
  }
}

export function createDefaultThemeRegistry(): ThemeRegistry {
  return new ThemeRegistry()
    .register(new FloorThemeGenerator())
    .register(new AgeThemeGenerator())
    .register(new FunctionThemeGenerator())
    .register(new RoadThemeGenerator())
    .register(new DensityThemeGenerator())
    .register(new VegetationThemeGenerator())
    .register(new WaterThemeGenerator())
    .register(new AccessibilityThemeGenerator())
    .register(new TerrainThemeGenerator());
}

export function isThematicMapDefinition(value: unknown): value is ThematicMapDefinition {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "type" in value &&
      "geojson" in value &&
      "legend" in value &&
      "style" in value
  );
}
