import type { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import type { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import type { DataHubApi } from "../DataHub";
import type {
  AnalysisDataRequirement,
  CanonicalDomain,
  DataHubError,
  DataHubWarning,
  QualityReport,
  TerritoryReference,
} from "../types";
import type { SourcePolicyEngine } from "../source-policy/SourcePolicyEngine";
import type { SourceSelectionDecision } from "../source-policy/types";
import type { DataHubLogger } from "../Observability";

export type AgentJobStatus =
  | "created" | "assessing" | "planning" | "acquiring" | "reviewing"
  | "waiting_manual_review" | "completed" | "partial" | "failed" | "cancelled";

export interface DataAcquisitionJob {
  id: string;
  projectId: string;
  territoryId: string;
  territory?: TerritoryReference;
  requestedDomains: CanonicalDomain[];
  requirements: AnalysisDataRequirement[];
  status: AgentJobStatus;
  attempt: number;
  maxAttempts: number;
  decisions: SourceSelectionDecision[];
  ingestionRunIds: string[];
  sourceRetryCounts?: Record<string, number>;
  maxSourceRetries?: number;
  createdAt: string;
  updatedAt: string;
  errors: DataHubError[];
  warnings: DataHubWarning[];
  lastCoverage?: CoverageAssessment;
  lastQuality?: QualityReviewResult;
}

export interface AgentMessage<T = unknown> {
  id: string;
  jobId: string;
  sender: "coverage" | "planner" | "executor" | "quality" | "orchestrator";
  type: string;
  createdAt: string;
  payload: T;
}

export interface CoverageAssessment {
  missingDomains: CanonicalDomain[];
  partialDomains: CanonicalDomain[];
  outdatedDomains: CanonicalDomain[];
  belowThresholdDomains: CanonicalDomain[];
  coveredDomains: CanonicalDomain[];
  warnings: string[];
  snapshotId?: string;
  qualityReportId?: string;
}

export interface QualityReviewResult {
  sufficient: boolean;
  missingRequirements: AnalysisDataRequirement[];
  manualReviewRequired: boolean;
  warnings: string[];
  snapshotId?: string;
  quality?: QualityReport | null;
}

export interface CoverageAssessmentInput {
  projectId: string;
  territoryId: string;
  requestedDomains: CanonicalDomain[];
  requirements: AnalysisDataRequirement[];
}

export interface SourcePlanningDependencies {
  sourceRegistry: SourceRegistry;
  sourcePolicyEngine: SourcePolicyEngine;
  sourceHealthMonitor: SourceHealthMonitor;
}

export interface AgentExecutionBackend {
  execute(job: DataAcquisitionJob): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export interface AgentJobRepository {
  create(job: DataAcquisitionJob): Promise<void>;
  update(job: DataAcquisitionJob): Promise<void>;
  get(id: string): Promise<DataAcquisitionJob | null>;
  listByProject(projectId: string): Promise<DataAcquisitionJob[]>;
}

export interface AgentOrchestratorDependencies {
  jobRepository: AgentJobRepository;
  dataHub: DataHubApi;
  sourcePlanning: SourcePlanningAgent;
  coverageAssessment: CoverageAssessmentAgent;
  acquisitionExecution: AcquisitionExecutionAgent;
  qualityReview: QualityReviewAgent;
  bus?: AgentBusApi;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  logger?: DataHubLogger;
}

export interface CoverageAssessmentAgent {
  assess(input: CoverageAssessmentInput): Promise<CoverageAssessment>;
}

export interface SourcePlanningAgent {
  plan(input: { projectId: string; territoryId: string; domains: CanonicalDomain[] }): Promise<SourceSelectionDecision[]>;
}

export type AcquisitionExecutionAgent = AgentExecutionBackend;

export interface QualityReviewAgent {
  review(input: { projectId: string; territoryId: string; requirements: AnalysisDataRequirement[] }): Promise<QualityReviewResult>;
}

export interface AgentBusApi {
  publish<T>(message: Omit<AgentMessage<T>, "id" | "createdAt">): AgentMessage<T>;
  subscribe<T>(listener: (message: AgentMessage<T>) => void): () => void;
}

export type AgentDataHub = Pick<DataHubApi, "refreshTerritory" | "getLatestSnapshot" | "getQualityReport">;
