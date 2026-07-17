import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type {
  DataSourceKind,
  FormiqBoundary,
  FormiqBuilding,
  FormiqPoi,
  FormiqRoad,
  FormiqTerrain,
  FormiqTransitStop,
  FormiqVegetation,
  FormiqWater,
  ProjectDataSource,
  SourceSyncState,
} from "@/types/formiq";

export interface SourceFeatureBase {
  source: DataSourceKind;
  sourceFeatureId: string;
  geometry: Geometry;
  tags: Record<string, string>;
  names?: Record<string, string>;
}

export interface SourceBuildingFeature extends SourceFeatureBase {
  kind: "building";
  levels?: number | null;
  height?: number | null;
  year?: number | null;
  usage?: string | null;
  material?: string | null;
  roof?: string | null;
  addressLabel?: string | null;
  objectType?: string | null;
}

export interface SourceRoadFeature extends SourceFeatureBase {
  kind: "road";
  roadType?: string | null;
  surface?: string | null;
  name?: string | null;
  lanes?: number | null;
}

export interface SourceVegetationFeature extends SourceFeatureBase {
  kind: "vegetation";
  vegetationType?: string | null;
}

export interface SourceWaterFeature extends SourceFeatureBase {
  kind: "water";
  waterType?: string | null;
}

export interface SourceTerrainFeature extends SourceFeatureBase {
  kind: "terrain";
  elevation?: number | null;
  slope?: number | null;
}

export interface SourceBoundaryFeature extends SourceFeatureBase {
  kind: "boundary";
  adminLevel?: string | null;
  name?: string | null;
}

export interface SourcePoiFeature extends SourceFeatureBase {
  kind: "poi";
  category?: string | null;
  subtype?: string | null;
  name?: string | null;
}

export interface SourceTransitStopFeature extends SourceFeatureBase {
  kind: "transit-stop";
  network?: string | null;
  stopType?: string | null;
  name?: string | null;
}

export type SourceFeature =
  | SourceBuildingFeature
  | SourceRoadFeature
  | SourceVegetationFeature
  | SourceWaterFeature
  | SourceTerrainFeature
  | SourceBoundaryFeature
  | SourcePoiFeature
  | SourceTransitStopFeature;

export interface SourceAdapterResult {
  source: DataSourceKind;
  version: string;
  features: SourceFeature[];
  metadata?: Record<string, string | number | boolean>;
}

export type SourceAdapterWorkerPayload =
  | {
      format: "source-features";
      features: SourceFeature[];
    }
  | {
      format: "overpass";
      responses: import("@/services/overpass").OverpassResponse[];
    }
  | {
      format: "geojson";
      features: Array<Feature<Geometry, GeoJsonProperties>>;
      normalization: "building" | "general";
      fallbackPrefix: string;
    }
  | {
      format: "terrain";
      features: Array<Feature<Extract<Geometry, { type: "Point" }>, { elevation?: unknown }>>;
      demType: string;
    };

export interface SourceAdapterRawResult {
  source: DataSourceKind;
  version: string;
  payload: SourceAdapterWorkerPayload;
  metadata?: Record<string, string | number | boolean>;
}

export interface SourceAdapterContext {
  bounds: BoundingBox;
  signal?: AbortSignal;
}

export interface SourceAdapter {
  source: DataSourceKind;
  version: string;
  fetch(context: SourceAdapterContext): Promise<SourceAdapterResult>;
  fetchRaw?(context: SourceAdapterContext): Promise<SourceAdapterRawResult>;
}

export interface SourceCacheEntry {
  cacheKey: string;
  result: SourceAdapterResult;
  cachedAt: string;
}

export interface FusionPriorityConfig {
  buildingGeometry: DataSourceKind[];
  buildingAddress: DataSourceKind[];
  buildingFunction: DataSourceKind[];
  poi: DataSourceKind[];
}

export interface DataFusionResult {
  bounds: BoundingBox;
  layers: GISLayer[];
  collections: {
    buildings: FormiqBuilding[];
    roads: FormiqRoad[];
    vegetation: FormiqVegetation[];
    water: FormiqWater[];
    terrain: FormiqTerrain[];
    boundaries: FormiqBoundary[];
    poi: FormiqPoi[];
    transitStops: FormiqTransitStop[];
  };
  sourceStates: SourceSyncState[];
  dataSources: ProjectDataSource[];
  statistics: {
    inputFeatureCount: number;
    fusedFeatureCount: number;
    duplicatesCollapsed: number;
    derivedAttributes: number;
  };
}

export interface FeatureCollectionBundle {
  buildings: FeatureCollection<Geometry, GeoJsonProperties>;
  roads: FeatureCollection<Geometry, GeoJsonProperties>;
  vegetation: FeatureCollection<Geometry, GeoJsonProperties>;
  water: FeatureCollection<Geometry, GeoJsonProperties>;
}
