import type { AnalysisCalculator, TerritoryAnalysis } from "../types";
import { calculateLineLength, calculatePolygonArea } from "@/utils";

export class AreaCalculator implements AnalysisCalculator<"territory"> {
  key = "territory" as const;

  calculate({ project }: Parameters<AnalysisCalculator<"territory">["calculate"]>[0]): TerritoryAnalysis {
    const activeTerritory =
      project.territories.find((territory) => territory.id === project.activeTerritoryId) ??
      project.territories.find((territory) => territory.isActive);

    if (activeTerritory) {
      const ring = activeTerritory.geometry.geometry.coordinates[0];

      return {
        area: calculatePolygonArea({
          type: "polygon",
          rings: activeTerritory.geometry.geometry.coordinates,
        }),
        perimeter: calculateLineLength({
          type: "line",
          coordinates: ring,
        }),
        boundaryCount: project.boundaries.length,
        poiCount: project.poi.length,
        transitStopCount: project.transitStops.length,
      };
    }

    const bounds = project.metadata.bounds;

    if (!bounds) {
      return {
        area: 0,
        perimeter: 0,
        boundaryCount: project.boundaries.length,
        poiCount: project.poi.length,
        transitStopCount: project.transitStops.length,
      };
    }

    const ring = [
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
      [bounds.west, bounds.south],
    ];

    return {
      area: calculatePolygonArea({
        type: "polygon",
        rings: [ring],
      }),
      perimeter: calculateLineLength({
        type: "line",
        coordinates: ring,
      }),
      boundaryCount: project.boundaries.length,
      poiCount: project.poi.length,
      transitStopCount: project.transitStops.length,
    };
  }
}
