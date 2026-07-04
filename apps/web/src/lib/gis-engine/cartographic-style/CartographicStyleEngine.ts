import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { CartographicThemeId } from "@/types/formiq";
import { CartographicThemeRegistry } from "./CartographicThemeRegistry";
import type {
  CartographicTheme,
  CompiledMapStyle,
  MapStyleSettings,
  RoadClassStyle,
  ThreeDVisualizationStyle,
} from "./types";

const ROAD_CLASS_STYLES: RoadClassStyle[] = [
  { roadType: "motorway", colorToken: "roadMotorway", casingWidth: 8, lineWidth: 5, order: 900 },
  { roadType: "trunk", colorToken: "roadMotorway", casingWidth: 7, lineWidth: 4.5, order: 850 },
  { roadType: "primary", colorToken: "roadPrimary", casingWidth: 6, lineWidth: 4, order: 800 },
  { roadType: "secondary", colorToken: "roadSecondary", casingWidth: 5, lineWidth: 3.2, order: 700 },
  { roadType: "tertiary", colorToken: "roadSecondary", casingWidth: 4, lineWidth: 2.6, order: 650 },
  { roadType: "residential", colorToken: "roadLocal", casingWidth: 3.4, lineWidth: 2, order: 500 },
  { roadType: "service", colorToken: "roadLocal", casingWidth: 2.8, lineWidth: 1.6, order: 400 },
  { roadType: "pedestrian", colorToken: "roadPedestrian", casingWidth: 2.6, lineWidth: 1.4, order: 300 },
  { roadType: "footway", colorToken: "roadPedestrian", casingWidth: 2, lineWidth: 1, order: 250 },
  { roadType: "cycleway", colorToken: "roadPedestrian", casingWidth: 2.2, lineWidth: 1.2, order: 260 },
  { roadType: "other", colorToken: "roadLocal", casingWidth: 2.6, lineWidth: 1.4, order: 200 },
];

export class CartographicStyleEngine {
  private readonly cache = new Map<string, CompiledMapStyle>();

  constructor(private readonly themes = new CartographicThemeRegistry()) {}

  getTheme(themeId: CartographicThemeId): CartographicTheme {
    return this.themes.get(themeId);
  }

  getThemeOptions(): Array<{ id: string; title: string }> {
    return this.themes.getOptions();
  }

  createBlankMapLibreStyle(themeId: CartographicThemeId): StyleSpecification {
    const theme = this.getTheme(themeId);

    return {
      version: 8,
      name: `FORMIQ ${theme.title}`,
      sources: {
        "formiq-osm-basemap": {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: "formiq-background",
          type: "background",
          paint: {
            "background-color": theme.colors.canvas,
          },
        },
        {
          id: "formiq-basemap",
          type: "raster",
          source: "formiq-osm-basemap",
          paint: {
            "raster-opacity": themeId === "print" ? 0.72 : themeId === "blueprint" ? 0.38 : 0.9,
            "raster-saturation": themeId === "blueprint" ? -1 : -0.15,
            "raster-contrast": themeId === "dark" ? 0.08 : 0,
            "raster-brightness-min": themeId === "dark" ? 0.18 : 0,
            "raster-brightness-max": themeId === "dark" ? 0.92 : 1,
          },
        },
      ],
    };
  }

  compile(settings: MapStyleSettings): CompiledMapStyle {
    const cacheKey = JSON.stringify(settings);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const theme = this.getTheme(settings.themeId);
    const compiled: CompiledMapStyle = {
      background: theme.colors.canvas,
      buildingFill: {
        "fill-color": theme.colors.buildingFill,
        "fill-opacity": settings.themeId === "print" ? 0.78 : 0.64,
      },
      buildingStroke: {
        "line-color": theme.colors.buildingStroke,
        "line-width": 0.9,
        "line-opacity": 0.9,
      },
      roadCasing: {
        "line-color": theme.colors.roadCasing,
        "line-width": createRoadWidthExpression(settings, "casing"),
        "line-opacity": settings.showRoadCasings ? 0.95 : 0,
      },
      roadLine: {
        "line-color": createRoadColorExpression(theme),
        "line-width": createRoadWidthExpression(settings, "line"),
        "line-opacity": 0.95,
      },
      vegetationFill: {
        "fill-color": theme.colors.vegetationFill,
        "fill-opacity": settings.themeId === "blueprint" ? 0.38 : 0.55,
      },
      waterFill: {
        "fill-color": theme.colors.waterFill,
        "fill-opacity": settings.themeId === "print" ? 0.62 : 0.7,
      },
    };

    this.cache.set(cacheKey, compiled);
    return compiled;
  }

  getSelectionPaint(themeId: CartographicThemeId): {
    fill: Record<string, unknown>;
    line: Record<string, unknown>;
    point: Record<string, unknown>;
  } {
    const theme = this.getTheme(themeId);

    return {
      fill: {
        "fill-color": theme.colors.selection,
        "fill-opacity": 0.16,
      },
      line: {
        "line-color": theme.colors.selection,
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
      point: {
        "circle-color": theme.colors.selection,
        "circle-radius": 5,
        "circle-stroke-color": theme.colors.paper,
        "circle-stroke-width": 2,
      },
    };
  }

  getThreeDStyle(themeId: CartographicThemeId): ThreeDVisualizationStyle {
    const theme = this.getTheme(themeId);

    return {
      themeId,
      projection: "orthographic",
      cameraPreset: "axonometric",
      materials: {
        building: createMaterial("white-building", theme.colors.whiteModelBuilding, theme.colors.buildingStroke, theme.colors.shadow),
        terrain: createMaterial("terrain", theme.colors.whiteModelTerrain, theme.colors.terrainFill, theme.colors.shadow),
        road: createMaterial("road", theme.colors.roadLocal, theme.colors.roadCasing, theme.colors.shadow),
        water: createMaterial("water", theme.colors.waterFill, theme.colors.waterStroke, theme.colors.shadow, 0.72),
        vegetation: createMaterial("vegetation", theme.colors.vegetationFill, theme.colors.vegetationStroke, theme.colors.shadow),
      },
    };
  }

  getRoadClassStyles(): RoadClassStyle[] {
    return ROAD_CLASS_STYLES;
  }
}

function createRoadColorExpression(theme: CartographicTheme): ExpressionSpecification {
  const pairs = ROAD_CLASS_STYLES.flatMap((style) => [
    style.roadType,
    theme.colors[style.colorToken],
  ]);

  return ["match", ["get", "roadType"], ...pairs, theme.colors.roadLocal] as unknown as ExpressionSpecification;
}

function createRoadWidthExpression(
  settings: MapStyleSettings,
  kind: "line" | "casing"
): ExpressionSpecification {
  const widthKey = kind === "line" ? "lineWidth" : "casingWidth";
  const pairs = ROAD_CLASS_STYLES.flatMap((style) => [
    style.roadType,
    style[widthKey] * settings.customRoadWidthMultiplier,
  ]);
  const classBased = ["match", ["get", "roadType"], ...pairs, kind === "line" ? 1.4 : 2.4];

  if (settings.roadWidthMode === "real-width") {
    return [
      "case",
      ["has", "lanes"],
      ["*", ["to-number", ["get", "lanes"]], kind === "line" ? 1.15 : 1.55],
      classBased,
    ] as unknown as ExpressionSpecification;
  }

  return classBased as unknown as ExpressionSpecification;
}

function createMaterial(
  id: string,
  color: string,
  outlineColor: string,
  shadowColor: string,
  opacity = 1
) {
  return {
    id,
    color,
    roughness: 0.82,
    opacity,
    outlineColor,
    shadowColor,
  };
}
