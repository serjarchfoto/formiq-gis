import type { ThematicLegendItem, ThematicPalette } from "../types";

export class LegendBuilder {
  build(
    distribution: Record<string, number>,
    labels: Record<string, string>,
    palette: ThematicPalette
  ): ThematicLegendItem[] {
    return Object.entries(distribution).map(([key, count]) => ({
      key,
      label: labels[key] ?? key,
      color: palette.colors[key] ?? palette.colors.unknown ?? "#9CA3AF",
      count,
    }));
  }
}
