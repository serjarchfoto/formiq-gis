import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  low: "1-3 этажа",
  mid: "4-8 этажей",
  high: "9-20 этажей",
  "very-high": "20+ этажей",
  unknown: "Неизвестно",
};

const palette = paletteManager.createPalette("floors-classic", {
  low: "#93C5FD",
  mid: "#3B82F6",
  high: "#1D4ED8",
  "very-high": "#1E3A8A",
  unknown: "#9CA3AF",
});

export class FloorThemeGenerator implements IThematicLayer {
  id = "floors";
  title = "Этажность";
  description = "Тематическая карта этажности зданий.";
  keywords = ["этажность", "этажи", "высота", "floors", "levels"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(analysis.buildings.floorDistribution, labels, palette),
      style: styleBuilder.buildDefaultStyle(),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: project.buildings.map((building) => {
          const category = building.semantic.heightCategory;
          const theme = analysis.buildings.floorTheme.find((item) => item.objectId === building.id);

          return createThematicFeature(
            building,
            category,
            theme?.legendGroup ?? `floors:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
