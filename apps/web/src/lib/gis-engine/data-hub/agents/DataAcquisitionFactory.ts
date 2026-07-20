import { createDefaultSourceRegistry } from "@/lib/gis-engine/data-source";
import { DEFAULT_IMPORT_SOURCE_ORDER, isImportSourceSupported } from "@/lib/gis-engine/projectBuilder";
import { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import { SourceManager } from "@/lib/gis-engine/fusion/SourceManager";
import { IngestionPipeline } from "../IngestionPipeline";
import { NormalizationPipeline } from "../NormalizationPipeline";
import { createDataHub, createIndexedDbDataHubRepositories } from "../DataHubFactory";
import { SourcePolicyEngine } from "../source-policy/SourcePolicyEngine";
import { DataHubCoverageAssessmentAgent } from "./CoverageAssessmentAgent";
import { DataHubAcquisitionExecutionAgent } from "./AcquisitionExecutionAgent";
import { DataHubQualityReviewAgent } from "./QualityReviewAgent";
import { DataHubSourcePlanningAgent } from "./SourcePlanningAgent";
import { DataAcquisitionOrchestrator } from "./DataAcquisitionOrchestrator";
import { IndexedDbAgentJobRepository } from "./AgentJobRepository";
import { AgentBus } from "./AgentBus";

/** Browser-safe composition root. UI receives the orchestrator, never its source dependencies. */
export function createBrowserDataAcquisitionOrchestrator(): DataAcquisitionOrchestrator {
  const sourceIds = DEFAULT_IMPORT_SOURCE_ORDER.filter(isImportSourceSupported);
  const sourceRegistry = createDefaultSourceRegistry(sourceIds);
  const dataSourceEngine = new DataSourceEngine(sourceRegistry);
  const sourceHealthMonitor = new SourceHealthMonitor(dataSourceEngine);
  const repositories = createIndexedDbDataHubRepositories();
  const jobRepository = new IndexedDbAgentJobRepository();
  const ingestionPipeline = new IngestionPipeline({
    sourceRegistry,
    dataSourceEngine,
    sourceManager: new SourceManager(dataSourceEngine),
    sourceHealthMonitor,
    rawRepository: repositories.rawData,
    ingestionRunRepository: repositories.ingestionRuns,
    normalizationPipeline: new NormalizationPipeline(),
  });
  const dataHub = createDataHub({ sourceRegistry, dataSourceEngine, sourceHealthMonitor, ingestionPipeline, repositories, agentJobRepository: jobRepository });
  const bus = new AgentBus();
  const policy = new SourcePolicyEngine();
  const coverageAssessment = new DataHubCoverageAssessmentAgent(dataHub);
  const sourcePlanning = new DataHubSourcePlanningAgent({ sourceRegistry, sourcePolicyEngine: policy, sourceHealthMonitor });
  const acquisitionExecution = new DataHubAcquisitionExecutionAgent({ dataHub, jobRepository, bus });
  const qualityReview = new DataHubQualityReviewAgent(dataHub);
  return new DataAcquisitionOrchestrator({ jobRepository, dataHub, sourcePlanning, coverageAssessment, acquisitionExecution, qualityReview, bus });
}
