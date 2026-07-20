import type { AnalysisDataRequirement, DataHubQueryServiceApi, DomainQuality } from "../types";
import type { QualityReviewAgent as QualityReviewAgentApi, QualityReviewResult } from "./types";

export class DataHubQualityReviewAgent implements QualityReviewAgentApi {
  constructor(private readonly queryService: Pick<DataHubQueryServiceApi, "getLatestSnapshot" | "getQualityReport">) {}

  async review(input: { projectId: string; territoryId: string; requirements: AnalysisDataRequirement[] }): Promise<QualityReviewResult> {
    const snapshot = await this.queryService.getLatestSnapshot({ projectId: input.projectId, territoryId: input.territoryId });
    const quality = snapshot ? await this.queryService.getQualityReport({ projectId: input.projectId, territoryId: input.territoryId, snapshotId: snapshot.id }) : null;
    const missingRequirements = input.requirements.filter((requirement) => {
      const features = snapshot?.features.filter((feature) => feature.domain === requirement.domain) ?? [];
      const domain = quality?.domains[requirement.domain];
      return features.length === 0 ||
        (requirement.minimumCoverage !== undefined && (domain?.coverageScore === null || domain?.coverageScore === undefined || domain.coverageScore < requirement.minimumCoverage)) ||
        (requirement.minimumQuality !== undefined && (domain?.overallScore === null || domain?.overallScore === undefined || domain.overallScore < requirement.minimumQuality));
    });
    const domainValues = Object.values(quality?.domains ?? {}) as Array<DomainQuality | undefined>;
    const warnings = domainValues.flatMap((domain) => domain?.warnings ?? []);
    if (!snapshot) warnings.push("No canonical snapshot was produced.");
    if (!quality) warnings.push("No quality report was produced.");
    const manualReviewRequired = !quality || (Object.values(quality.domains) as Array<DomainQuality | undefined>).some((domain) => domain?.measurement === "unknown");
    return {
      sufficient: Boolean(snapshot && quality && missingRequirements.every((requirement) => !requirement.required)),
      missingRequirements,
      manualReviewRequired,
      warnings: [...new Set(warnings)],
      snapshotId: snapshot?.id,
      quality,
    };
  }
}
