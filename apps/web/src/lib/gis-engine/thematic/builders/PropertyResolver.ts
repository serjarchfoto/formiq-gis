import type { GeoJsonProperties } from "geojson";

export class PropertyResolver {
  resolve(properties: GeoJsonProperties | null, property: string, fallback = "unknown"): string {
    const value = properties?.[property];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }

    return fallback;
  }
}
