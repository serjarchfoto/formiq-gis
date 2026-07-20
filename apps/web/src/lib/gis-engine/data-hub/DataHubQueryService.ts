import type { CanonicalRepository, QualityRepository } from "./repositories";
import type {
  AnalysisDataRequirement,
  CanonicalDomain,
  CanonicalQuery,
  CanonicalQueryResult,
  CanonicalSnapshot,
  DataHubAnalysisContext,
  DataHubQueryServiceApi,
  QualityReport,
} from "./types";

/** Read-only Data Hub API. It never invokes connectors, ingestion or analysis. */
export class DataHubQueryService implements DataHubQueryServiceApi {
  constructor(
    private readonly canonicalRepository: CanonicalRepository,
    private readonly qualityRepository: QualityRepository
  ) {}

  async queryCanonical(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    const result = await this.canonicalRepository.query(query);
    if (!result.snapshotId) return result;
    const quality = await this.getQualityReport({
      projectId: query.projectId,
      territoryId: query.territoryId,
      snapshotId: result.snapshotId,
    });
    return { ...result, quality: quality ?? undefined };
  }

  queryLayers(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    return this.queryCanonical(query);
  }

  getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null> {
    return this.canonicalRepository.getLatestSnapshot(input);
  }

  async getQualityReport(input: {
    projectId: string;
    territoryId: string;
    snapshotId?: string;
  }): Promise<QualityReport | null> {
    if (!input.snapshotId) return this.qualityRepository.getLatest(input);
    const reports = await this.qualityRepository.listByProject(input.projectId);
    return reports.find((report) =>
      report.territoryId === input.territoryId && report.canonicalSnapshotId === input.snapshotId
    ) ?? null;
  }

  async queryAnalysisContext(input: {
    projectId: string;
    territoryId: string;
    requirements: AnalysisDataRequirement[];
  }): Promise<DataHubAnalysisContext> {
    const snapshot = await this.getLatestSnapshot(input);
    if (!snapshot) throw new DataHubQueryError("SNAPSHOT_NOT_FOUND", "Canonical snapshot is unavailable.");
    const quality = await this.getQualityReport({ ...input, snapshotId: snapshot.id });
    if (!quality) throw new DataHubQueryError("QUALITY_NOT_FOUND", `Quality report is unavailable for snapshot "${snapshot.id}".`);
    const queryResult = await this.canonicalRepository.query({
      projectId: input.projectId,
      territoryId: input.territoryId,
      domains: uniqueDomains(input.requirements),
      preferredOnly: true,
    });
    const features = groupByDomain(queryResult.features);
    const missingRequirements = input.requirements.filter((requirement) => requirementMissing(requirement, features, quality));
    const warnings = [
      ...new Set([
        ...Object.values(quality.domains).flatMap((domain) => domain?.warnings ?? []),
        ...input.requirements.flatMap((requirement) => requirementWarnings(requirement, quality)),
      ]),
    ];

    return {
      projectId: input.projectId,
      territoryId: input.territoryId,
      snapshotId: snapshot.id,
      features,
      quality,
      ready: missingRequirements.filter((requirement) => requirement.required).length === 0,
      degraded: quality.overallStatus !== "complete" || missingRequirements.length > 0,
      missingRequirements,
      warnings,
    };
  }
}

export class DataHubQueryError extends Error {
  constructor(readonly code: "SNAPSHOT_NOT_FOUND" | "QUALITY_NOT_FOUND", message: string) {
    super(message);
    this.name = "DataHubQueryError";
  }
}

function uniqueDomains(requirements: AnalysisDataRequirement[]): CanonicalDomain[] {
  return [...new Set(requirements.map((requirement) => requirement.domain))];
}

function groupByDomain(features: CanonicalQueryResult["features"]): DataHubAnalysisContext["features"] {
  return features.reduce<DataHubAnalysisContext["features"]>((groups, feature) => {
    (groups[feature.domain] ??= []).push(feature);
    return groups;
  }, {});
}

function requirementMissing(
  requirement: AnalysisDataRequirement,
  features: DataHubAnalysisContext["features"],
  quality: QualityReport
): boolean {
  if ((features[requirement.domain]?.length ?? 0) === 0) return true;
  const domain = quality.domains[requirement.domain];
  if (!domain) return true;
  if (requirement.minimumCoverage !== undefined &&
    (domain.coverageScore === null || domain.coverageScore < requirement.minimumCoverage)) return true;
  if (requirement.minimumQuality !== undefined &&
    (domain.overallScore === null || domain.overallScore < requirement.minimumQuality)) return true;
  return false;
}

function requirementWarnings(requirement: AnalysisDataRequirement, quality: QualityReport): string[] {
  const domain = quality.domains[requirement.domain];
  if (requirement.minimumCoverage !== undefined && domain?.coverageScore === null) {
    return [`${requirement.domain}: required coverage is unknown.`];
  }
  if (requirement.minimumQuality !== undefined && domain?.overallScore === null) {
    return [`${requirement.domain}: required overall quality is unknown.`];
  }
  return [];
}
