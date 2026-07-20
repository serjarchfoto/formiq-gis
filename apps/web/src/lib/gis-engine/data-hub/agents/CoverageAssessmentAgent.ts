import type { CanonicalDomain, DataHubQueryServiceApi } from "../types";
import type { CoverageAssessment, CoverageAssessmentAgent as CoverageAssessmentAgentApi, CoverageAssessmentInput } from "./types";

export class DataHubCoverageAssessmentAgent implements CoverageAssessmentAgentApi {
  constructor(private readonly queryService: Pick<DataHubQueryServiceApi, "getLatestSnapshot" | "getQualityReport">) {}

  async assess(input: CoverageAssessmentInput): Promise<CoverageAssessment> {
    const snapshot = await this.queryService.getLatestSnapshot({ projectId: input.projectId, territoryId: input.territoryId });
    const quality = snapshot ? await this.queryService.getQualityReport({ projectId: input.projectId, territoryId: input.territoryId, snapshotId: snapshot.id }) : null;
    const requirements = new Map(input.requirements.map((requirement) => [requirement.domain, requirement]));
    const missingDomains: CanonicalDomain[] = [];
    const partialDomains: CanonicalDomain[] = [];
    const outdatedDomains: CanonicalDomain[] = [];
    const belowThresholdDomains: CanonicalDomain[] = [];
    const coveredDomains: CanonicalDomain[] = [];
    const warnings: string[] = [];

    for (const domain of unique(input.requestedDomains)) {
      const features = snapshot?.features.filter((feature) => feature.domain === domain) ?? [];
      const domainQuality = quality?.domains[domain];
      const requirement = requirements.get(domain);
      if (!snapshot || features.length === 0) {
        missingDomains.push(domain);
        continue;
      }
      if (!domainQuality || domainQuality.status === "partial" || domainQuality.status === "degraded") partialDomains.push(domain);
      if (domainQuality?.freshnessScore !== null && domainQuality?.freshnessScore !== undefined && domainQuality.freshnessScore < 0.5) outdatedDomains.push(domain);
      if (requirement && (belowCoverage(domainQuality?.coverageScore, requirement.minimumCoverage) || belowQuality(domainQuality?.overallScore, requirement.minimumQuality))) {
        belowThresholdDomains.push(domain);
      }
      if (!partialDomains.includes(domain) && !outdatedDomains.includes(domain) && !belowThresholdDomains.includes(domain)) coveredDomains.push(domain);
      if (domainQuality?.warnings.length) warnings.push(...domainQuality.warnings.map((warning) => `${domain}: ${warning}`));
    }
    if (!snapshot) warnings.push("Canonical snapshot is unavailable.");
    if (!quality) warnings.push("Quality report is unavailable.");
    return {
      missingDomains, partialDomains, outdatedDomains, belowThresholdDomains, coveredDomains,
      warnings: [...new Set(warnings)], snapshotId: snapshot?.id, qualityReportId: quality?.id,
    };
  }
}

function belowCoverage(score: number | null | undefined, threshold: number | undefined): boolean {
  return threshold !== undefined && (score === null || score === undefined || score < threshold);
}

function belowQuality(score: number | null | undefined, threshold: number | undefined): boolean {
  return threshold !== undefined && (score === null || score === undefined || score < threshold);
}

function unique(domains: CanonicalDomain[]): CanonicalDomain[] { return [...new Set(domains)]; }
