import type { Feature, Polygon, Position } from "geojson";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type {
  BoundingBox,
  GISImportFormat,
  GISLayerCategory,
  GISLayerGeometryType,
  GISLayerStyle,
  RasterSourceType,
} from "@/types/gis";

export type FormiqGeometryType = "point" | "line" | "polygon";
export type ProjectWorkspaceMode = "architecture" | "analysis" | "presentation" | "3d";
export type CartographicThemeId = "light" | "dark" | "blueprint" | "print";
export type RoadWidthMode = "class-based" | "real-width" | "custom";
export type ProjectUnits = "m";
export type TerritoryType = "working-area" | "context-area" | "study-area";
export type SemanticCategoryValue = string;
export type DataSourceKind =
  | "osm"
  | "geojson"
  | "shapefile"
  | "kml"
  | "gpx"
  | "overture"
  | "microsoft-buildings"
  | "wikidata"
  | "sentinel-2"
  | "copernicus-dem"
  | "open-topography"
  | "gtfs"
  | "open-weather"
  | "manual";
export type ImportSourceId =
  | "osm"
  | "microsoft-buildings"
  | "overture"
  | "wikidata"
  | "gtfs"
  | "copernicus-dem"
  | "sentinel-2"
  | "open-weather";
export type UnifiedFeatureKind =
  | "building"
  | "road"
  | "vegetation"
  | "water"
  | "terrain"
  | "boundary"
  | "poi"
  | "transit-stop";
export type ProvenanceOrigin = "source" | "merged" | "derived" | "manual" | "unknown";
export type DataConfidence = "high" | "medium" | "low" | "unknown";
export type FeatureLifecycleState = "active" | "cached" | "stale" | "error";

export interface FormiqBaseGeometry {
  type: FormiqGeometryType;
}

export interface FormiqPointGeometry extends FormiqBaseGeometry {
  type: "point";
  coordinates: Position;
}

export interface FormiqLineGeometry extends FormiqBaseGeometry {
  type: "line";
  coordinates: Position[];
}

export interface FormiqPolygonGeometry extends FormiqBaseGeometry {
  type: "polygon";
  rings: Position[][];
}

export type FormiqGeometry =
  | FormiqPointGeometry
  | FormiqLineGeometry
  | FormiqPolygonGeometry;

export interface AttributeProvenance {
  source: DataSourceKind | "derived" | "unknown";
  sourceFeatureId: string | null;
  origin: ProvenanceOrigin;
  confidence: DataConfidence;
  updatedAt: string;
  note?: string;
}

export interface FeatureAttributeProvenance {
  [attributeName: string]: AttributeProvenance[];
}

export interface FeatureProvenance {
  primarySource: DataSourceKind | "unknown";
  sourceFeatureIds: Partial<Record<DataSourceKind, string[]>>;
  mergedSources: DataSourceKind[];
  geometrySource: DataSourceKind | "unknown";
  attributes: FeatureAttributeProvenance;
  qualityScore: number;
  confidence: DataConfidence;
}

export interface WhiteModelDescriptor {
  extrusionHeight: number | null;
  extrusionMode: "absolute-height" | "relative-height" | "levels-derived" | "unknown";
  baseElevation: number | null;
  materialProfile: string;
  colorSchemeId: string;
}

export interface Semantic3DDescriptor {
  semanticColorGroup: string;
  materialId: string;
  renderPriority: number;
}

export interface FormiqEntityBase {
  id: string;
  type: UnifiedFeatureKind;
  geometry: FormiqGeometry;
  tags: Record<string, string>;
  names?: Record<string, string>;
  source: DataSourceKind | "unknown";
  confidence: DataConfidence;
  provenance: FeatureProvenance;
  lifecycleState: FeatureLifecycleState;
}

export type BuildingHeightCategory = "low" | "mid" | "high" | "very-high" | "unknown";
export type BuildingAgeCategory =
  | "historic-pre-1917"
  | "soviet-early"
  | "soviet-mid"
  | "soviet-late"
  | "post-soviet"
  | "contemporary"
  | "unknown";
export type BuildingFunctionCategory =
  | "residential"
  | "commercial"
  | "industrial"
  | "public"
  | "education"
  | "healthcare"
  | "religious"
  | "sports"
  | "mixed"
  | "unknown";
export type DensityCategory = "small-footprint" | "medium-footprint" | "large-footprint" | "unknown";
export type SemanticImportance = "low" | "medium" | "high" | "critical" | "unknown";
export type SemanticRelation = "adjacent" | "near" | "isolated" | "unknown";
export type SemanticColorGroup =
  | "building-low"
  | "building-mid"
  | "building-high"
  | "road-primary"
  | "road-secondary"
  | "green"
  | "water"
  | "terrain"
  | "unknown";

export interface BuildingSemantic {
  heightCategory: BuildingHeightCategory;
  ageCategory: BuildingAgeCategory;
  functionCategory: BuildingFunctionCategory;
  densityCategory: DensityCategory;
  importance: SemanticImportance;
  colorGroup: SemanticColorGroup;
  transportRelation: SemanticRelation;
  greenRelation: SemanticRelation;
  isHistoric: boolean;
  isPublic: boolean;
  isResidential: boolean;
}

export type TransportCategory =
  | "regional"
  | "city"
  | "local"
  | "service"
  | "pedestrian"
  | "cycle"
  | "unknown";

export interface RoadSemantic {
  importance: SemanticImportance;
  lanes: number | null;
  transportCategory: TransportCategory;
  colorGroup: SemanticColorGroup;
}

export type TreeDensity = "sparse" | "medium" | "dense" | "unknown";
export type LandscapeCategory = "park" | "forest" | "grass" | "garden" | "recreation" | "unknown";

export interface VegetationSemantic {
  greenType: string;
  treeDensity: TreeDensity;
  landscapeCategory: LandscapeCategory;
  importance: SemanticImportance;
  colorGroup: SemanticColorGroup;
}

export interface WaterSemantic {
  waterType: string;
  importance: SemanticImportance;
  colorGroup: SemanticColorGroup;
}

export type SlopeCategory = "flat" | "gentle" | "moderate" | "steep" | "unknown";
export type ElevationCategory = "low" | "medium" | "high" | "unknown";

export interface TerrainSemantic {
  slopeCategory: SlopeCategory;
  elevationCategory: ElevationCategory;
  importance: SemanticImportance;
  colorGroup: SemanticColorGroup;
}

export type BuildingUsage =
  | "residential"
  | "commercial"
  | "industrial"
  | "public"
  | "education"
  | "healthcare"
  | "religious"
  | "sports"
  | "mixed"
  | "unknown";

export interface Building3DParameters {
  absoluteHeight: number | null;
  relativeHeight: number | null;
  heightFromLevels: number | null;
  baseElevation: number | null;
  volume: number | null;
  whiteModel: WhiteModelDescriptor;
  semantic3D: Semantic3DDescriptor;
}

export interface FormiqBuilding extends FormiqEntityBase {
  type: "building";
  geometry: FormiqPolygonGeometry;
  height: number | null;
  absoluteHeight: number | null;
  relativeHeight: number | null;
  heightFromLevels: number | null;
  levels: number | null;
  baseElevation: number | null;
  area: number;
  volume: number | null;
  year: number | null;
  usage: BuildingUsage;
  material: string | null;
  roof: string | null;
  objectType: string | null;
  addressLabel: string | null;
  semantic: BuildingSemantic;
  threeD: Building3DParameters;
}

export type RoadType =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "service"
  | "pedestrian"
  | "footway"
  | "cycleway"
  | "other";

export interface FormiqRoad extends FormiqEntityBase {
  type: "road";
  geometry: FormiqLineGeometry;
  length: number;
  roadType: RoadType;
  surface: string | null;
  name: string | null;
  lanes: number | null;
  semantic: RoadSemantic;
}

export interface FormiqVegetation extends FormiqEntityBase {
  type: "vegetation";
  geometry: FormiqPolygonGeometry;
  area: number;
  vegetationType: string | null;
  semantic: VegetationSemantic;
}

export interface FormiqWater extends FormiqEntityBase {
  type: "water";
  geometry: FormiqPolygonGeometry;
  area: number;
  waterType: string | null;
  semantic: WaterSemantic;
}

export interface FormiqTerrain extends FormiqEntityBase {
  type: "terrain";
  geometry: FormiqGeometry;
  elevation: number | null;
  slope: number | null;
  semantic: TerrainSemantic;
}

export interface FormiqBoundary extends FormiqEntityBase {
  type: "boundary";
  geometry: FormiqPolygonGeometry;
  adminLevel: string | null;
  name: string | null;
}

export interface FormiqPoi extends FormiqEntityBase {
  type: "poi";
  geometry: FormiqPointGeometry | FormiqPolygonGeometry;
  category: string;
  subtype: string | null;
  name: string | null;
}

export interface FormiqTransitStop extends FormiqEntityBase {
  type: "transit-stop";
  geometry: FormiqPointGeometry;
  network: string | null;
  stopType: string | null;
  name: string | null;
}

export type FormiqEntity =
  | FormiqBuilding
  | FormiqRoad
  | FormiqVegetation
  | FormiqWater
  | FormiqTerrain
  | FormiqBoundary
  | FormiqPoi
  | FormiqTransitStop;

export interface FormiqLayerMetadata {
  source: string;
  importedAt: string;
  bounds?: BoundingBox;
  featureCount: number;
}

export interface FormiqLayerData {
  category: GISLayerCategory;
  buildings: FormiqBuilding[];
  roads: FormiqRoad[];
  vegetation: FormiqVegetation[];
  water: FormiqWater[];
  terrain: FormiqTerrain[];
  boundaries?: FormiqBoundary[];
  poi?: FormiqPoi[];
  transitStops?: FormiqTransitStop[];
  metadata: FormiqLayerMetadata;
}

export interface ProjectLayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  sourceType: GISImportFormat | RasterSourceType | "osm" | "fusion" | "manual";
  removable: boolean;
  order: number;
  category: GISLayerCategory;
  geometryType: GISLayerGeometryType;
  source: {
    id: string;
    name: string;
    format: GISImportFormat | RasterSourceType | "osm" | "overture" | "microsoft-buildings" | "wikidata";
  };
  data?: FormiqLayerData | FeatureCollection<Geometry, GeoJsonProperties>;
  style: GISLayerStyle;
}

export interface TerritoryBuffer {
  distanceMeters: number;
  bounds?: BoundingBox;
}

export interface TerritoryAnalysisSettings {
  includeBufferInImport: boolean;
  calculateOnlyInsideWorkingArea: boolean;
}

export interface FormiqTerritory {
  id: string;
  name: string;
  type: TerritoryType;
  geometry: Feature<Polygon>;
  bounds: BoundingBox;
  loadingBuffer: TerritoryBuffer;
  analysisSettings: TerritoryAnalysisSettings;
  thematicMapIds: string[];
  analysisResultIds: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ProjectDisplaySettings {
  workspaceMode: ProjectWorkspaceMode;
  activeThematicMapType: string;
  cartographicTheme: CartographicThemeId;
  roadWidthMode: RoadWidthMode;
  customRoadWidthMultiplier: number;
  analysisLayerOpacity: number;
  showRoadCasings: boolean;
  showLabels: boolean;
  showPoi: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  mapCenter: [number, number];
  mapZoom: number;
  showContextPanel: boolean;
}

export interface ProjectAnalysisSettings {
  defaultBufferMeters: number;
  includeRoadsInBuffer: boolean;
  includeWaterInBuffer: boolean;
  includeGreenInBuffer: boolean;
}

export interface ProjectExportSettings {
  author: string;
  paperFormat: "A4" | "A3" | "A2" | "custom";
  units: "metric";
}

export interface ProjectAIContext {
  summary: string;
  facts: string[];
  userPrompts: string[];
  generatedInsights: string[];
}

export interface ProjectImportSettings {
  sources: Record<ImportSourceId, boolean>;
  duplicatePolicy: "prefer-primary" | "keep-separate";
  splitLargeRequests: boolean;
}

export interface WhiteModelState {
  status: "not-created" | "planned" | "generated";
  modelIds: string[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
}

export interface Semantic3DState {
  status: "not-created" | "planned" | "generated";
  sceneIds: string[];
  materialProfile: string;
}

export interface LayoutViewState {
  id: string;
  name: string;
  type: "map-sheet" | "analysis-sheet" | "axonometry" | "report";
  status: "draft" | "ready" | "exported";
  createdAt: string;
  updatedAt: string;
}

export interface ExportArtifact {
  id: string;
  name: string;
  type: "pdf" | "png" | "svg" | "psd" | "geojson" | "model";
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ProjectDataSource {
  id: string;
  name: string;
  kind: DataSourceKind;
  connectedAt: string;
  status: "active" | "inactive" | "error";
  version?: string;
  cacheKey?: string;
  featureCount?: number;
  errorMessage?: string | null;
}

export interface ProjectOperation {
  id: string;
  type:
    | "project-created"
    | "project-opened"
    | "territory-created"
    | "territory-updated"
    | "territory-activated"
    | "data-imported"
    | "analysis-built"
    | "thematic-map-built"
    | "workspace-mode-changed"
    | "project-settings-updated";
  label: string;
  createdAt: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface UnifiedFeatureCollections {
  buildings: FormiqBuilding[];
  roads: FormiqRoad[];
  vegetation: FormiqVegetation[];
  water: FormiqWater[];
  terrain: FormiqTerrain[];
  boundaries: FormiqBoundary[];
  poi: FormiqPoi[];
  transitStops: FormiqTransitStop[];
}

export interface SourceSyncState {
  source: DataSourceKind;
  status: "idle" | "loading" | "ready" | "error";
  updatedAt: string | null;
  version: string;
  featureCount: number;
  cacheHit: boolean;
  errorMessage: string | null;
}

export interface DataFusionStatistics {
  inputFeatureCount: number;
  fusedFeatureCount: number;
  duplicatesCollapsed: number;
  derivedAttributes: number;
}

export interface DataFusionSnapshot {
  fusedAt: string;
  bounds?: BoundingBox;
  cacheKey: string;
  collections: UnifiedFeatureCollections;
  sourceStates: SourceSyncState[];
  statistics: DataFusionStatistics;
}

export interface FormiqProjectData {
  id: string;
  name: string;
  description: string;
  city: string;
  author: string;
  crs: string;
  units: ProjectUnits;
  territories: FormiqTerritory[];
  activeTerritoryId: string | null;
  settings: {
    display: ProjectDisplaySettings;
    analysis: ProjectAnalysisSettings;
    export: ProjectExportSettings;
  };
  dataSources: ProjectDataSource[];
  layers: FormiqLayerData[];
  layerSystem: ProjectLayerState[];
  buildings: FormiqBuilding[];
  roads: FormiqRoad[];
  vegetation: FormiqVegetation[];
  water: FormiqWater[];
  terrain: FormiqTerrain[];
  boundaries: FormiqBoundary[];
  poi: FormiqPoi[];
  transitStops: FormiqTransitStop[];
  fusion: DataFusionSnapshot | null;
  importSettings: ProjectImportSettings;
  analysisResults: Record<string, unknown>;
  thematicMaps: Record<string, unknown>;
  whiteModel: WhiteModelState;
  semantic3D: Semantic3DState;
  layoutViews: LayoutViewState[];
  exportArtifacts: ExportArtifact[];
  history: ProjectOperation[];
  aiContext: ProjectAIContext;
  metadata: {
    createdAt: string;
    updatedAt: string;
    bounds?: BoundingBox;
  };
}
