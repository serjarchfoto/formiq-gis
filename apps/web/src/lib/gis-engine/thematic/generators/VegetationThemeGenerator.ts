import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  park: "Парк",
  forest: "Лес",
  grass: "Трава",
  garden: "Сад",
  recreation: "Рекреация",
  unknown: "Озеленение",
};

const palette = paletteManager.createPalette("vegetation-classic", {
  park: "#16A34A",
  forest: "#15803D",
  grass: "#4ADE80",
  garden: "#22C55E",
  recreation: "#65A30D",
  unknown: "#22C55E",
});

export class VegetationThemeGenerator implements IThematicLayer {
  id = "vegetation";
  title = "Озеленение";
  description = "Тематическая карта зелёных территорий.";
  keywords = ["озеленение", "зелень", "парки", "vegetation", "green"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(analysis.vegetation.categories, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.62 }),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: project.vegetation.map((vegetation) => {
          const category = vegetation.semantic.landscapeCategory;
          const theme = analysis.vegetation.vegetationTheme.find(
            (item) => item.objectId === vegetation.id
          );

          return createThematicFeature(
            vegetation,
            category,
            theme?.legendGroup ?? `vegetation:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
