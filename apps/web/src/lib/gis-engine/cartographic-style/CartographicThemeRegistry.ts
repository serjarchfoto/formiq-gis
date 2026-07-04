import type { CartographicTheme, MapStyleSettings } from "./types";
import { CARTOGRAPHIC_THEMES } from "./cartographicThemes";

export class CartographicThemeRegistry {
  constructor(private readonly themes: CartographicTheme[] = CARTOGRAPHIC_THEMES) {}

  get(themeId: MapStyleSettings["themeId"]): CartographicTheme {
    return this.themes.find((theme) => theme.id === themeId) ?? this.themes[0];
  }

  getAll(): CartographicTheme[] {
    return this.themes;
  }

  getOptions(): Array<{ id: string; title: string }> {
    return this.themes.map((theme) => ({
      id: theme.id,
      title: theme.title,
    }));
  }
}
