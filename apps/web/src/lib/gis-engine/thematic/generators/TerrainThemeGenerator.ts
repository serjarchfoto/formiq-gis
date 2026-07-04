import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  low: "Низкие отметки",
  medium: "Средние отметки",
  high: "Высокие отметки",
  unknown: "Рельеф",
};

const palette = paletteManager.createPalette("terrain-elevation", {
  low: "#86EFAC",
  medium: "#FACC15",
  high: "#F97316",
  unknown: "#94A3B8",
});

export class TerrainThemeGenerator implements IThematicLayer {
  id = "terrain";
  title = "Высоты";
  description = "Тематическая карта рельефа и высотных отметок.";
  keywords = ["рельеф", "высоты", "terrain", "dem"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    const counts = project.terrain.reduce<Record<string, number>>((result, terrain) => {
      const category = terrain.semantic.elevationCategory;
      result[category] = (result[category] ?? 0) + 1;

      return result;
    }, analysis.terrain.elevationCategories);

    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(counts, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.48, lineWidth: 1.4 }),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: project.terrain.map((terrain) => {
          const category = terrain.semantic.elevationCategory;

          return createThematicFeature(
            terrain,
            category,
            `terrain:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
