import type { ThematicPalette } from "../types";

export type PaletteName = "classic" | "grayscale" | "competition" | "satellite" | "pastel" | "dark";

export class PaletteManager {
  createPalette(id: string, colors: Record<string, string>, title = "Classic"): ThematicPalette {
    return {
      id,
      title,
      colors,
    };
  }

  createFallbackPalette(): ThematicPalette {
    return {
      id: "fallback",
      title: "Fallback",
      colors: {
        unknown: "#9CA3AF",
      },
    };
  }
}
