import type { Geometry, MultiPolygon, Polygon } from "geojson";
import type { FormiqProjectData } from "@/types/formiq";
import type { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import type { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import type { SourceManager } from "@/lib/gis-engine/fusion/SourceManager";
import type { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import type { SourcePolicyEngine } from "./source-policy/SourcePolicyEngine";
import type { SourceSelectionDecision } from "./source-policy/types";
import type { IngestionRunRepository, RawDataRepository } from "./repositories";

export type CanonicalDomain =
  | "building"
  | "road"
  | "waterbody"
  | "green_area"
  | "parcel"
  | "poi"
  | "transport_stop"
  | "boundary"
  | "terrain"
  | "imagery";

export type DatasetStatus = "empty" | "partial" | "complete" | "degraded" | "failed";
export type QualityMeasurement = "measured" | "estimated" | "unknown";

/** Data Hub view of the existing FormiqTerritory boundary and BoundingBox. */
export interface TerritoryReference {
  id: string;
  projectId: string;
  geometry: Polygon | MultiPolygon;
  bbox: [number, number, number, number];
  crs: string;
}

export interface ProvenanceRecord {
  sourceId: string;
  sourceType: string;
  sourceFeatureId?: string;
  acquiredAt: string;
  processedAt: string;
  acquisitionMethod: "api" | "ogc" | "download" | "database" | "manual" | "derived" | "legacy";
  rawRecordId?: string;
  license?: string;
  attribution?: string;
  transformationSteps: string[];
}

/** Snapshot projection of existing fused FORMIQ entities, not a replacement for SourceFeature. */
export interface CanonicalFeature {
  id: string;
  domain: CanonicalDomain;
  geometry: Geometry;
  attributes: Record<string, unknown>;
  projectId: string;
  territoryId: string;
  provenance: ProvenanceRecord[];
  geometryConfidence: number | null;
  attributeConfidence: number | null;
  overallConfidence: number | null;
  missingFields: string[];
  validationWarnings: string[];
  preferred: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawDataRecord {
  id: string;
  ingestionRunId: string;
  projectId: string;
  territoryId: string;
  sourceId: string;
  domain: CanonicalDomain;
  receivedAt: string;
  contentType?: string;
  sourceMetadata: Record<string, unknown>;
  payload: unknown;
  checksum?: string;
}

export interface DataHubError {
  code: string;
  message: string;
  sourceId?: string;
  domain?: CanonicalDomain;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface DataHubWarning {
  code: string;
  message: string;
  sourceId?: string;
  domain?: CanonicalDomain;
}

export type IngestionErrorCode =
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_AUTH_REQUIRED"
  | "SOURCE_INVALID_RESPONSE"
  | "RAW_PERSIST_FAILED"
  | "INGESTION_ABORTED"
  | "DOMAIN_PARTIAL"
  | "ALL_SOURCES_FAILED";

export interface SourceFetchEnvelope {
  sourceId: string;
  domain: CanonicalDomain;
  rawPayload: unknown;
  metadata: Record<string, unknown>;
  legacyNormalizedPayload?: unknown;
  usedLegacyNormalization: boolean;
}

export interface NormalizationContext {
  projectId: string;
  territoryId: string;
  ingestionRunId: string;
  sourceId: string;
  sourceType: string;
  domain: CanonicalDomain;
  rawRecordId: string;
  acquiredAt: string;
}

export interface NormalizationIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  sourceFeatureId?: string;
}

export interface NormalizedSourceFeature {
  sourceFeatureId?: string;
  domain: CanonicalDomain;
  geometry: Geometry;
  attributes: Record<string, unknown>;
  provenance: ProvenanceRecord;
  geometryConfidence: number | null;
  attributeConfidence: number | null;
  missingFields: string[];
  validationWarnings: string[];
}

export interface NormalizedSourceDataset {
  sourceId: string;
  domain: CanonicalDomain;
  rawRecordIds: string[];
  features: NormalizedSourceFeature[];
  issues: NormalizationIssue[];
  startedAt: string;
  finishedAt: string;
}

export interface SourceNormalizer {
  supports(input: { sourceId: string; sourceType: string; domain: CanonicalDomain }): boolean;
  normalize(raw: RawDataRecord[], context: NormalizationContext): Promise<NormalizedSourceDataset>;
}

export interface NormalizationPipelineApi {
  normalize(input: {
    envelope: SourceFetchEnvelope;
    rawRecord: RawDataRecord;
    signal?: AbortSignal;
  }): Promise<NormalizedSourceDataset>;
}

export interface IngestionProgressEvent {
  runId: string;
  stage:
    | "planning"
    | "health_check"
    | "fetching"
    | "raw_persisted"
    | "normalizing"
    | "fusing"
    | "quality"
    | "completed"
    | "failed";
  domain?: CanonicalDomain;
  sourceId?: string;
  completed: number;
  total: number;
  message?: string;
}

export interface IngestionPipelineDependencies {
  sourceRegistry: SourceRegistry;
  dataSourceEngine: DataSourceEngine;
  sourceManager: SourceManager;
  sourceHealthMonitor: SourceHealthMonitor;
  sourcePolicyEngine?: SourcePolicyEngine;
  rawRepository: RawDataRepository;
  ingestionRunRepository: IngestionRunRepository;
  normalizationPipeline: NormalizationPipelineApi;
}

export interface IngestionPipelineApi {
  run(
    request: RefreshTerritoryRequest,
    options?: {
      onProgress?: (event: IngestionProgressEvent) => void;
      signal?: AbortSignal;
    }
  ): Promise<{ run: IngestionRun; normalized: NormalizedSourceDataset[] }>;
}

export interface IngestionRun {
  id: string;
  projectId: string;
  territoryId: string;
  requestedDomains: CanonicalDomain[];
  sourceIds: string[];
  status: "created" | "running" | "partial" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  rawRecordIds: string[];
  canonicalSnapshotId?: string;
  qualityReportId?: string;
  sourcePolicyDecisions?: SourceSelectionDecision[];
  errors: DataHubError[];
  warnings: DataHubWarning[];
}

export interface DomainQuality {
  domain: CanonicalDomain;
  status: DatasetStatus;
  featureCount: number;
  coverageScore: number | null;
  geometryScore: number | null;
  attributeScore: number | null;
  freshnessScore: number | null;
  sourceReliabilityScore: number | null;
  overallScore: number | null;
  measurement: QualityMeasurement;
  measurements: {
    coverage: QualityMeasurement;
    geometry: QualityMeasurement;
    attributes: QualityMeasurement;
    freshness: QualityMeasurement;
    sourceReliability: QualityMeasurement;
    overall: QualityMeasurement;
  };
  missingRequirements: string[];
  warnings: string[];
  sourceIds: string[];
}

export interface QualityReport {
  id: string;
  projectId: string;
  territoryId: string;
  canonicalSnapshotId: string;
  createdAt: string;
  overallStatus: DatasetStatus;
  overallScore: number | null;
  domains: Partial<Record<CanonicalDomain, DomainQuality>>;
}

export interface QualityEngineApi {
  evaluate(input: {
    snapshot: CanonicalSnapshot;
    territory: TerritoryReference;
    sourceHealth: Record<string, unknown>;
    sourceMetadata: Record<string, unknown>;
  }): Promise<QualityReport>;
}

export interface CanonicalSnapshot {
  id: string;
  projectId: string;
  territoryId: string;
  ingestionRunId: string;
  createdAt: string;
  version: number;
  features: CanonicalFeature[];
  qualityReportId?: string;
}

export interface CanonicalFusionConflict {
  domain: CanonicalDomain;
  candidateFeatureIds: string[];
  preferredFeatureId?: string;
  reason: string;
}

export interface CanonicalFusionResult {
  features: CanonicalFeature[];
  conflicts: CanonicalFusionConflict[];
  warnings: DataHubWarning[];
}

export interface CanonicalFusionServiceApi {
  fuse(input: {
    projectId: string;
    territoryId: string;
    ingestionRunId: string;
    datasets: NormalizedSourceDataset[];
    previousSnapshot?: CanonicalSnapshot | null;
  }): Promise<CanonicalFusionResult>;
}

export interface CanonicalSnapshotBuilderApi {
  buildAndSave(input: {
    projectId: string;
    territoryId: string;
    ingestionRunId: string;
    features: CanonicalFeature[];
    previousSnapshot?: CanonicalSnapshot | null;
  }): Promise<CanonicalSnapshot>;
}

export interface CanonicalProjectProjectionApi {
  projectSnapshot(input: {
    existingProject: FormiqProjectData;
    canonicalSnapshot: CanonicalSnapshot;
    quality: QualityReport;
    territory: TerritoryReference;
  }): Promise<FormiqProjectData>;
}

export interface RefreshTerritoryRequest {
  projectId: string;
  territory: TerritoryReference;
  domains: CanonicalDomain[];
  forceRefresh?: boolean;
  preferredSourceIds?: string[];
  excludedSourceIds?: string[];
}

export interface RefreshTerritoryResult {
  ingestionRun: IngestionRun;
  snapshot: CanonicalSnapshot;
  quality: QualityReport;
}

export interface CanonicalQuery {
  projectId: string;
  territoryId: string;
  domains?: CanonicalDomain[];
  bbox?: [number, number, number, number];
  minConfidence?: number;
  preferredOnly?: boolean;
}

export interface CanonicalQueryResult {
  snapshotId: string;
  features: CanonicalFeature[];
  quality?: QualityReport;
}

export interface AnalysisDataRequirement {
  domain: CanonicalDomain;
  required: boolean;
  minimumCoverage?: number;
  minimumQuality?: number;
}

/** Named explicitly to avoid colliding with the existing analysis calculator context. */
export interface DataHubAnalysisContext {
  projectId: string;
  territoryId: string;
  snapshotId: string;
  features: Partial<Record<CanonicalDomain, CanonicalFeature[]>>;
  quality: QualityReport;
  ready: boolean;
  degraded: boolean;
  missingRequirements: AnalysisDataRequirement[];
  warnings: string[];
}

export interface DataHubQueryServiceApi {
  queryCanonical(query: CanonicalQuery): Promise<CanonicalQueryResult>;
  queryLayers(query: CanonicalQuery): Promise<CanonicalQueryResult>;
  getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null>;
  getQualityReport(input: { projectId: string; territoryId: string; snapshotId?: string }): Promise<QualityReport | null>;
  queryAnalysisContext(input: {
    projectId: string;
    territoryId: string;
    requirements: AnalysisDataRequirement[];
  }): Promise<DataHubAnalysisContext>;
}

export interface TerritoryDataStatus {
  projectId: string;
  territoryId: string;
  latestSnapshot: CanonicalSnapshot | null;
  lastRefresh: IngestionRun | null;
  domainStatuses: Partial<Record<CanonicalDomain, DomainQuality>>;
  sourceChain: SourceSelectionDecision[];
  quality: QualityReport | null;
  activeIngestion: IngestionRun | null;
  activeAgentJob?: { id: string; status: string; updatedAt: string } | null;
  warnings: DataHubWarning[];
}
