import type { ThematicBuildContext, ThematicMapDefinition, IThematicLayer } from "../types";
import { createThematicFeature } from "./themeFeatureFactory";
import { legendBuilder, paletteManager, styleBuilder } from "./thematicBuilders";

const labels: Record<string, string> = {
  transit: "Транспорт",
  education: "Образование",
  healthcare: "Медицина",
  services: "Сервисы",
  public: "Общественные",
  unknown: "POI",
};

const palette = paletteManager.createPalette("accessibility-services", {
  transit: "#2563EB",
  education: "#7C3AED",
  healthcare: "#DC2626",
  services: "#EA580C",
  public: "#0891B2",
  unknown: "#64748B",
});

export class AccessibilityThemeGenerator implements IThematicLayer {
  id = "accessibility";
  title = "Доступность";
  description = "Тематическая карта доступности сервисов, POI и остановок.";
  keywords = ["доступность", "poi", "остановки", "accessibility"];
  supports3D = false;
  supportsPSD = true;

  build({ project }: ThematicBuildContext): ThematicMapDefinition {
    const poiFeatures = project.poi.map((poi) => {
      const category = normalizePoiCategory(poi.category);

      return createThematicFeature(
        poi,
        category,
        `accessibility:${category}`,
        palette.colors[category] ?? palette.colors.unknown
      );
    });
    const transitFeatures = project.transitStops.map((stop) =>
      createThematicFeature(stop, "transit", "accessibility:transit", palette.colors.transit)
    );
    const counts = [...poiFeatures, ...transitFeatures].reduce<Record<string, number>>(
      (result, feature) => {
        const category =
          typeof feature.properties?.category === "string" ? feature.properties.category : "unknown";
        result[category] = (result[category] ?? 0) + 1;

        return result;
      },
      {}
    );

    return {
      id: this.id,
      type: this.id,
      title: this.title,
      description: this.description,
      palette,
      legend: legendBuilder.build(counts, labels, palette),
      style: styleBuilder.buildDefaultStyle({ fillOpacity: 0.72, lineWidth: 1 }),
      metadata: {
        title: this.title,
        description: this.description,
        keywords: this.keywords,
        supports3D: this.supports3D,
        supportsPSD: this.supportsPSD,
      },
      geojson: {
        type: "FeatureCollection",
        features: [...poiFeatures, ...transitFeatures],
      },
    };
  }
}

function normalizePoiCategory(category: string | null): string {
  if (!category) {
    return "unknown";
  }

  if (category.includes("school") || category.includes("education")) {
    return "education";
  }

  if (category.includes("hospital") || category.includes("clinic") || category.includes("health")) {
    return "healthcare";
  }

  if (category.includes("public") || category.includes("civic")) {
    return "public";
  }

  return "services";
}
