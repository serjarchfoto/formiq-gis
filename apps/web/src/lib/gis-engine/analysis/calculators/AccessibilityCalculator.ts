import type { AccessibilityAnalysis, AnalysisCalculator, ThematicRenderItem } from "../types";

export class AccessibilityCalculator implements AnalysisCalculator<"accessibility"> {
  key = "accessibility" as const;

  calculate({ project }: Parameters<AnalysisCalculator<"accessibility">["calculate"]>[0]): AccessibilityAnalysis {
    const stops: ThematicRenderItem[] = project.transitStops.map((stop) => ({
      objectId: stop.id,
      category: stop.stopType ?? "public-transport",
      legendGroup: "accessibility:stop:300m",
      renderColor: "#DC5B3E",
    }));
    const classifyPoi = (category: string) => {
      const normalized = category.toLowerCase();
      if (/school|college|university|kindergarten|education/.test(normalized)) return "schools" as const;
      if (/hospital|clinic|doctor|health/.test(normalized)) return "hospitals" as const;
      if (/metro|subway|station/.test(normalized)) return "metro" as const;
      return "services" as const;
    };
    const groups = {
      metro: [] as ThematicRenderItem[],
      schools: [] as ThematicRenderItem[],
      hospitals: [] as ThematicRenderItem[],
      services: [] as ThematicRenderItem[],
    };
    project.poi.forEach((poi) => {
      const group = classifyPoi(`${poi.category} ${poi.subtype ?? ""}`);
      groups[group].push({
        objectId: poi.id,
        category: group,
        legendGroup: `accessibility:${group}`,
        renderColor: group === "metro" ? "#7C3AED" : group === "hospitals" ? "#EF4444" : "#229ED9",
      });
    });

    return {
      status: stops.length + project.poi.length > 0 ? "ready" : "not-available",
      metro: groups.metro,
      stops,
      schools: groups.schools,
      hospitals: groups.hospitals,
      services: groups.services,
      coveragePercent: stops.length > 0 ? 100 : project.poi.length > 0 ? 35 : 0,
      walkingDistanceMeters: 300,
      reason: stops.length > 0
        ? "Зоны доступности рассчитаны по остановкам с радиусом 300 м; для точного времени пути нужен пешеходный граф."
        : "Остановки общественного транспорта не найдены; отображены только доступные POI.",
    };
  }
}
