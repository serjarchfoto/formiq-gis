import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const palette = paletteManager.createPalette("water-classic", {
  lake: "#38BDF8",
  pond: "#7DD3FC",
  reservoir: "#0EA5E9",
  river: "#0284C7",
  canal: "#0369A1",
  water: "#38BDF8",
  unknown: "#38BDF8",
});

export class WaterThemeGenerator implements IThematicLayer {
  id = "water";
  title = "Вода";
  description = "Тематическая карта водных объектов.";
  keywords = ["вода", "реки", "водоёмы", "water"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    const counts = project.water.reduce<Record<string, number>>((result, water) => {
      const category = water.semantic.waterType;
      result[category] = (result[category] ?? 0) + 1;

      return result;
    }, {});

    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(counts, { unknown: "Вода", water: "Вода" }, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.68 }),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: project.water.map((water) => {
          const category = water.semantic.waterType;
          const theme = analysis.water.waterTheme.find((item) => item.objectId === water.id);

          return createThematicFeature(
            water,
            category,
            theme?.legendGroup ?? `water:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
