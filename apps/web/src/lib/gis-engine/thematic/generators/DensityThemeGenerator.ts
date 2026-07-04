import type { DensityCategory } from "@/types/formiq";
import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<DensityCategory, string> = {
  "small-footprint": "Низкая плотность",
  "medium-footprint": "Средняя плотность",
  "large-footprint": "Высокая плотность",
  unknown: "Неизвестно",
};

const palette = paletteManager.createPalette("density-classic", {
  "small-footprint": "#BBF7D0",
  "medium-footprint": "#FDE68A",
  "large-footprint": "#EF4444",
  unknown: "#9CA3AF",
});

export class DensityThemeGenerator implements IThematicLayer {
  id = "density";
  title = "Плотность";
  description = "Тематическая карта плотности и пятна застройки.";
  keywords = ["плотность", "density", "gsi", "footprint"];
  supports3D = true;
  supportsPSD = true;

  build({ project }: ThematicBuildContext): ThematicMapDefinition {
    const distribution = project.buildings.reduce<Record<DensityCategory, number>>(
      (result, building) => {
        result[building.semantic.densityCategory] += 1;
        return result;
      },
      {
        "small-footprint": 0,
        "medium-footprint": 0,
        "large-footprint": 0,
        unknown: 0,
      }
    );

    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(distribution, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.76 }),
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
          const category = building.semantic.densityCategory;

          return createThematicFeature(
            building,
            category,
            `density:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
