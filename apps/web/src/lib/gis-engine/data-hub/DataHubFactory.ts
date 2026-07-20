import type { DataSourceEngine } from "@/lib/gis-engine/data-source/DataSourceEngine";
import type { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import type { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import { DataFusionEngine, type DataFusionEngine as DataFusionEngineType } from "@/lib/gis-engine/fusion/DataFusionEngine";
import { SourceManager } from "@/lib/gis-engine/fusion/SourceManager";
import { CanonicalFusionService } from "./CanonicalFusionService";
import { CanonicalSnapshotBuilder } from "./CanonicalSnapshotBuilder";
import { DataHub, type DataHubApi } from "./DataHub";
import { DataHubQueryService } from "./DataHubQueryService";
import { QualityEngine } from "./QualityEngine";
import {
  IndexedDbCanonicalRepository,
  IndexedDbIngestionRunRepository,
  IndexedDbQualityRepository,
  IndexedDbRawDataRepository,
  type CanonicalRepository,
  type IngestionRunRepository,
  type QualityRepository,
  type RawDataRepository,
} from "./repositories";
import type { IngestionPipelineApi } from "./types";
import type { DataHubLogger } from "./Observability";

export interface DataHubRepositoryBundle {
  rawData: RawDataRepository;
  ingestionRuns: IngestionRunRepository;
  canonical: CanonicalRepository;
  quality: QualityRepository;
}

export interface DataHubFactoryDependencies {
  sourceRegistry: SourceRegistry;
  dataSourceEngine: DataSourceEngine;
  dataFusionEngine?: DataFusionEngineType;
  sourceHealthMonitor: SourceHealthMonitor;
  ingestionPipeline: IngestionPipelineApi;
  repositories?: DataHubRepositoryBundle;
  agentJobRepository?: { listByProject(projectId: string): Promise<Array<{ id: string; territoryId: string; status: string; updatedAt: string }>> };
  logger?: DataHubLogger;
}

export function createIndexedDbDataHubRepositories(): DataHubRepositoryBundle {
  return {
    rawData: new IndexedDbRawDataRepository(),
    ingestionRuns: new IndexedDbIngestionRunRepository(),
    canonical: new IndexedDbCanonicalRepository(),
    quality: new IndexedDbQualityRepository(),
  };
}

export function createDataHub(dependencies: DataHubFactoryDependencies): DataHubApi {
  if (dependencies.dataSourceEngine.registry !== dependencies.sourceRegistry) {
    throw new Error("DataHubFactory must receive the SourceRegistry owned by DataSourceEngine.");
  }
  const repositories = dependencies.repositories ?? createIndexedDbDataHubRepositories();
  const queryService = new DataHubQueryService(repositories.canonical, repositories.quality);
  const fusionEngine = dependencies.dataFusionEngine ?? new DataFusionEngine(new SourceManager(dependencies.dataSourceEngine));
  return new DataHub({
    ingestionPipeline: dependencies.ingestionPipeline,
    canonicalFusionService: new CanonicalFusionService(fusionEngine),
    snapshotBuilder: new CanonicalSnapshotBuilder(repositories.canonical, repositories.ingestionRuns),
    qualityEngine: new QualityEngine(),
    queryService,
    sourceHealthMonitor: dependencies.sourceHealthMonitor,
    rawDataRepository: repositories.rawData,
    ingestionRunRepository: repositories.ingestionRuns,
    qualityRepository: repositories.quality,
    agentJobRepository: dependencies.agentJobRepository,
    logger: dependencies.logger,
  });
}
