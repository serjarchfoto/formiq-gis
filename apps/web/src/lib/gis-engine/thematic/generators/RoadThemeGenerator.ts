import type { RoadType } from "@/types/formiq";
import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<RoadType, string> = {
  motorway: "Магистрали",
  trunk: "Транзитные",
  primary: "Основные",
  secondary: "Второстепенные",
  tertiary: "Третьего класса",
  residential: "Жилые улицы",
  service: "Сервисные",
  pedestrian: "Пешеходные",
  footway: "Тротуары",
  cycleway: "Веломаршруты",
  other: "Прочие",
};

const palette = paletteManager.createPalette("roads-classic", {
  motorway: "#DC2626",
  trunk: "#EA580C",
  primary: "#F59E0B",
  secondary: "#84CC16",
  tertiary: "#22C55E",
  residential: "#38BDF8",
  service: "#64748B",
  pedestrian: "#A855F7",
  footway: "#C084FC",
  cycleway: "#14B8A6",
  other: "#94A3B8",
});

export class RoadThemeGenerator implements IThematicLayer {
  id = "roads";
  title = "Дороги";
  description = "Тематическая карта классов дорожной сети.";
  keywords = ["дороги", "road", "network", "transport"];
  supports3D = false;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    const roadDistribution = Object.fromEntries(
      Object.entries(analysis.roads.lengthByCategory).map(([key, value]) => [
        key,
        value > 0 ? project.roads.filter((road) => road.roadType === key).length : 0,
      ])
    ) as Record<RoadType, number>;

    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(roadDistribution, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.78, lineWidth: 3 }),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: project.roads.map((road) => {
          const category = road.roadType;
          const theme = analysis.roads.roadTheme.find((item) => item.objectId === road.id);

          return createThematicFeature(
            road,
            category,
            theme?.legendGroup ?? `roads:${category}`,
            palette.colors[category] ?? palette.colors.other
          );
        }),
      },
    };
  }
}
