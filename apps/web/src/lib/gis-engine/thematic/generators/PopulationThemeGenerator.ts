import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

type PopulationCategory = "none" | "low" | "medium" | "high";
const labels: Record<PopulationCategory, string> = {
  none: "Нет жилой функции",
  low: "Низкая оценка",
  medium: "Средняя оценка",
  high: "Высокая оценка",
};
const palette = paletteManager.createPalette("population-derived", {
  none: "#CBD5E1",
  low: "#FEF3C7",
  medium: "#FDBA74",
  high: "#DC2626",
});

export class PopulationThemeGenerator implements IThematicLayer {
  id = "population";
  title = "Плотность населения";
  description = "Расчётная оценка по жилой площади и этажности зданий; не заменяет официальную статистику.";
  keywords = ["население", "population", "residential", "density"];
  supports3D = false;
  supportsPSD = true;

  build({ project }: ThematicBuildContext): ThematicMapDefinition {
    const distribution = { none: 0, low: 0, medium: 0, high: 0 } as Record<PopulationCategory, number>;
    const features = project.buildings.map((building) => {
      const estimatedResidents = building.usage === "residential"
        ? building.area * (building.levels ?? 1) * 0.035
        : 0;
      const category: PopulationCategory = estimatedResidents === 0 ? "none" : estimatedResidents < 25 ? "low" : estimatedResidents < 100 ? "medium" : "high";
      distribution[category] += 1;
      return createThematicFeature(building, category, `population:${category}`, palette.colors[category]);
    });
    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(distribution, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.72 }),
      metadata: { title: this.title, description: this.description, keywords: this.keywords, supports3D: this.supports3D, supportsPSD: this.supportsPSD },
      geojson: { type: "FeatureCollection", features },
    };
  }
}
