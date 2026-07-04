import type { ThematicMapStyle } from "../types";

export class StyleBuilder {
  buildDefaultStyle(overrides: Partial<ThematicMapStyle> = {}): ThematicMapStyle {
    return {
      fillColorProperty: "renderColor",
      lineColorProperty: "renderColor",
      fillOpacity: 0.72,
      lineOpacity: 0.9,
      lineWidth: 2,
      ...overrides,
    };
  }
}
