import type { CartographicThemeId } from "@/types/formiq";
import type { SymbolDefinition } from "./types";

export class GISSymbolLibrary {
  private readonly symbols: SymbolDefinition[] = [
    createSymbol("bus-stop", "Bus stop", "transport", "M8 3h8v10H8z M10 15h2v2h-2z M14 15h2v2h-2z", ["poi", "transit-stop"]),
    createSymbol("metro", "Metro", "transport", "M4 18 8 4h4l4 14h-3l-1-4H8l-1 4z", ["poi", "transit-stop"]),
    createSymbol("school", "School", "education", "M12 3 3 8l9 5 9-5z M6 11v4l6 3 6-3v-4", ["poi"]),
    createSymbol("university", "University", "education", "M3 9 12 4l9 5v2H3z M5 12h14v6H5z", ["poi"]),
    createSymbol("hospital", "Hospital", "health", "M6 4h12v16H6z M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4z", ["poi"]),
    createSymbol("pharmacy", "Pharmacy", "health", "M5 5h14v14H5z M11 8h2v3h3v2h-3v3h-2v-3H8v-2h3z", ["poi"]),
    createSymbol("cafe", "Cafe", "food", "M6 7h10v5a5 5 0 0 1-10 0z M16 8h3v3a3 3 0 0 1-3 3", ["poi"]),
    createSymbol("parking", "Parking", "mobility", "M7 4h6a4 4 0 0 1 0 8h-3v6H7z M10 7v2h3a1 1 0 0 0 0-2z", ["poi"]),
    createSymbol("park", "Park", "landscape", "M12 3c4 4 5 8 1 10v5h-2v-5C7 11 8 7 12 3z", ["poi", "vegetation"]),
    createSymbol("museum", "Museum", "culture", "M4 9 12 4l8 5v2H4z M6 12h12v6H6z", ["poi"]),
    createSymbol("religion", "Religious", "civic", "M12 3v5 M9 6h6 M7 20h10v-7a5 5 0 0 0-10 0z", ["poi"]),
    createSymbol("administration", "Administration", "civic", "M5 5h14v14H5z M8 9h8 M8 12h8 M8 15h5", ["poi", "boundary"]),
  ];

  getAll(): SymbolDefinition[] {
    return this.symbols;
  }

  getByCategory(category: string): SymbolDefinition[] {
    return this.symbols.filter((symbol) => symbol.category === category);
  }

  resolveColor(themeId: CartographicThemeId): string {
    if (themeId === "blueprint") return "#D9F3FF";
    if (themeId === "dark") return "#F8FAFC";
    return "#111827";
  }
}

function createSymbol(
  id: string,
  title: string,
  category: string,
  path: string,
  featureKinds: SymbolDefinition["featureKinds"]
): SymbolDefinition {
  return {
    id,
    title,
    category,
    path,
    featureKinds,
  };
}
