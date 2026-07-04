import type {
  BuildingAgeCategory,
  BuildingFunctionCategory,
  BuildingHeightCategory,
  DensityCategory,
  ElevationCategory,
  LandscapeCategory,
  SemanticColorGroup,
  SemanticImportance,
  SemanticRelation,
  SlopeCategory,
  TransportCategory,
  TreeDensity,
} from "@/types/formiq";

export interface SemanticRegistryDefinition {
  buildingHeightCategories: Record<BuildingHeightCategory, string>;
  buildingAgeCategories: Record<BuildingAgeCategory, string>;
  buildingFunctionCategories: Record<BuildingFunctionCategory, string>;
  densityCategories: Record<DensityCategory, string>;
  importanceCategories: Record<SemanticImportance, string>;
  relationCategories: Record<SemanticRelation, string>;
  colorGroups: Record<SemanticColorGroup, string>;
  transportCategories: Record<TransportCategory, string>;
  treeDensityCategories: Record<TreeDensity, string>;
  landscapeCategories: Record<LandscapeCategory, string>;
  slopeCategories: Record<SlopeCategory, string>;
  elevationCategories: Record<ElevationCategory, string>;
}

export const SemanticRegistry: SemanticRegistryDefinition = {
  buildingHeightCategories: {
    low: "Low-rise building",
    mid: "Mid-rise building",
    high: "High-rise building",
    "very-high": "Very high building",
    unknown: "Unknown height",
  },
  buildingAgeCategories: {
    "historic-pre-1917": "Historic pre-1917",
    "soviet-early": "1917-1945",
    "soviet-mid": "1945-1970",
    "soviet-late": "1970-1990",
    "post-soviet": "1990-2010",
    contemporary: "After 2010",
    unknown: "Unknown age",
  },
  buildingFunctionCategories: {
    residential: "Residential",
    commercial: "Commercial",
    industrial: "Industrial",
    public: "Public",
    education: "Education",
    healthcare: "Healthcare",
    religious: "Religious",
    sports: "Sports",
    mixed: "Mixed use",
    unknown: "Unknown function",
  },
  densityCategories: {
    "small-footprint": "Small footprint",
    "medium-footprint": "Medium footprint",
    "large-footprint": "Large footprint",
    unknown: "Unknown density",
  },
  importanceCategories: {
    low: "Low importance",
    medium: "Medium importance",
    high: "High importance",
    critical: "Critical importance",
    unknown: "Unknown importance",
  },
  relationCategories: {
    adjacent: "Adjacent",
    near: "Near",
    isolated: "Isolated",
    unknown: "Unknown relation",
  },
  colorGroups: {
    "building-low": "Low building mask color",
    "building-mid": "Mid building mask color",
    "building-high": "High building mask color",
    "road-primary": "Primary road mask color",
    "road-secondary": "Secondary road mask color",
    green: "Vegetation mask color",
    water: "Water mask color",
    terrain: "Terrain mask color",
    unknown: "Unknown mask color",
  },
  transportCategories: {
    regional: "Regional transport",
    city: "City transport",
    local: "Local transport",
    service: "Service transport",
    pedestrian: "Pedestrian transport",
    cycle: "Cycle transport",
    unknown: "Unknown transport",
  },
  treeDensityCategories: {
    sparse: "Sparse vegetation",
    medium: "Medium vegetation",
    dense: "Dense vegetation",
    unknown: "Unknown vegetation density",
  },
  landscapeCategories: {
    park: "Park",
    forest: "Forest",
    grass: "Grass",
    garden: "Garden",
    recreation: "Recreation",
    unknown: "Unknown landscape",
  },
  slopeCategories: {
    flat: "Flat terrain",
    gentle: "Gentle slope",
    moderate: "Moderate slope",
    steep: "Steep slope",
    unknown: "Unknown slope",
  },
  elevationCategories: {
    low: "Low elevation",
    medium: "Medium elevation",
    high: "High elevation",
    unknown: "Unknown elevation",
  },
};
