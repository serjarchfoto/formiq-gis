import type {
  BuildingAgeCategory,
  BuildingFunctionCategory,
  BuildingHeightCategory,
  FormiqProjectData,
  LandscapeCategory,
  RoadType,
} from "@/types/formiq";
import type { DataHubAnalysisContext } from "@/lib/gis-engine/data-hub";

export interface AnalysisContext {
  analysisId: string;
  /** Compatibility projection built only from the selected canonical context. */
  project: FormiqProjectData;
  dataHub: DataHubAnalysisContext;
  source: "canonical" | "legacy";
  warnings: string[];
}

export type AnalysisContextState = "ready" | "degraded" | "missing_required_data";

export interface AnalysisExecutionResult {
  analysisId: string;
  result: AnalysisResult;
  state: AnalysisContextState;
  warnings: string[];
  snapshotId: string;
  source: "canonical" | "legacy";
}

export interface ThematicRenderItem {
  objectId: string;
  category: string;
  legendGroup: string;
  renderColor: string;
}

export interface TerritoryAnalysis {
  area: number;
  perimeter: number;
  boundaryCount: number;
  poiCount: number;
  transitStopCount: number;
}

export interface BuildingAnalysis {
  count: number;
  footprintArea: number;
  footprintPercent: number;
  totalFloorArea: number;
  averageLevels: number | null;
  maxLevels: number | null;
  floorDistribution: Record<BuildingHeightCategory, number>;
  ageDistribution: Record<BuildingAgeCategory, number>;
  functionDistribution: Record<BuildingFunctionCategory, number>;
  floorTheme: ThematicRenderItem[];
  ageTheme: ThematicRenderItem[];
  functionTheme: ThematicRenderItem[];
  ageCoveragePercent: number;
  functionCoveragePercent: number;
  floorCoveragePercent: number;
  estimatedPopulation: number;
  populationCoveragePercent: number;
  dataNotes: string[];
}

export interface RoadAnalysis {
  totalLength: number;
  lengthByCategory: Record<RoadType, number>;
  networkDensity: number;
  roadTheme: ThematicRenderItem[];
}

export interface VegetationAnalysis {
  area: number;
  territoryPercent: number;
  categories: Record<LandscapeCategory, number>;
  vegetationTheme: ThematicRenderItem[];
}

export interface WaterAnalysis {
  area: number;
  territoryPercent: number;
  waterTheme: ThematicRenderItem[];
}

export interface TerrainAnalysis {
  status: "not-available" | "ready";
  slopeCategories: Record<string, number>;
  elevationCategories: Record<string, number>;
  minElevation: number | null;
  maxElevation: number | null;
  averageElevation: number | null;
  coveragePercent: number;
  reason: string | null;
}

export interface AccessibilityAnalysis {
  status: "not-available" | "ready";
  metro: ThematicRenderItem[];
  stops: ThematicRenderItem[];
  schools: ThematicRenderItem[];
  hospitals: ThematicRenderItem[];
  services: ThematicRenderItem[];
  coveragePercent: number;
  walkingDistanceMeters: number;
  reason: string | null;
}

export interface AnalysisResult {
  territory: TerritoryAnalysis;
  buildings: BuildingAnalysis;
  roads: RoadAnalysis;
  vegetation: VegetationAnalysis;
  water: WaterAnalysis;
  terrain: TerrainAnalysis;
  accessibility: AccessibilityAnalysis;
}

export type AnalysisSectionKey = keyof AnalysisResult;

export interface AnalysisCalculator<K extends AnalysisSectionKey = AnalysisSectionKey> {
  key: K;
  calculate: (context: Pick<AnalysisContext, "project">, partialResult: Partial<AnalysisResult>) => AnalysisResult[K];
}
