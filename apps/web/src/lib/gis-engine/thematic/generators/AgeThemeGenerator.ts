import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  "historic-pre-1917": "До 1917",
  "soviet-early": "1917-1945",
  "soviet-mid": "1945-1970",
  "soviet-late": "1970-1990",
  "post-soviet": "1990-2010",
  contemporary: "После 2010",
  unknown: "Неизвестно",
};

const palette = paletteManager.createPalette("age-classic", {
  "historic-pre-1917": "#92400E",
  "soviet-early": "#B45309",
  "soviet-mid": "#D97706",
  "soviet-late": "#F59E0B",
  "post-soviet": "#FBBF24",
  contemporary: "#FCD34D",
  unknown: "#9CA3AF",
});

export class AgeThemeGenerator implements IThematicLayer {
  id = "age";
  title = "Возраст";
  description = "Тематическая карта возраста зданий.";
  keywords = ["возраст", "год", "период", "age", "year"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(analysis.buildings.ageDistribution, labels, palette),
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
          const category = building.semantic.ageCategory;
          const theme = analysis.buildings.ageTheme.find((item) => item.objectId === building.id);

          return createThematicFeature(
            building,
            category,
            theme?.legendGroup ?? `age:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
