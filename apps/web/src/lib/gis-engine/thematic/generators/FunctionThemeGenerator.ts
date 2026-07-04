import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  residential: "Жилая",
  commercial: "Коммерческая",
  industrial: "Производственная",
  public: "Общественная",
  education: "Образование",
  healthcare: "Медицина",
  religious: "Религия",
  sports: "Спорт",
  mixed: "Смешанная",
  unknown: "Неизвестно",
};

const palette = paletteManager.createPalette("function-classic", {
  residential: "#60A5FA",
  commercial: "#F59E0B",
  industrial: "#6B7280",
  public: "#A855F7",
  education: "#22C55E",
  healthcare: "#EF4444",
  religious: "#8B5CF6",
  sports: "#14B8A6",
  mixed: "#A855F7",
  unknown: "#9CA3AF",
});

export class FunctionThemeGenerator implements IThematicLayer {
  id = "function";
  title = "Функции";
  description = "Тематическая карта функционального использования зданий.";
  keywords = ["функции", "зонирование", "назначение", "landuse", "function"];
  supports3D = true;
  supportsPSD = true;

  build({ project, analysis }: ThematicBuildContext): ThematicMapDefinition {
    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(analysis.buildings.functionDistribution, labels, palette),
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
          const category = building.semantic.functionCategory;
          const theme = analysis.buildings.functionTheme.find((item) => item.objectId === building.id);

          return createThematicFeature(
            building,
            category,
            theme?.legendGroup ?? `function:${category}`,
            palette.colors[category] ?? palette.colors.unknown
          );
        }),
      },
    };
  }
}
