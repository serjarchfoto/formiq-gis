import type { SourceHealthMonitor } from "@/lib/gis-engine/data-source/SourceHealthMonitor";
import type { SourceRegistry } from "@/lib/gis-engine/data-source/SourceRegistry";
import type { DataSourceKind } from "@/types/formiq";
import type { CanonicalDomain } from "../types";
import type { SourceCandidate, SourceSelectionDecision } from "../source-policy/types";
import type { SourcePolicyEngine } from "../source-policy/SourcePolicyEngine";
import type { SourcePlanningAgent as SourcePlanningAgentApi } from "./types";

export class DataHubSourcePlanningAgent implements SourcePlanningAgentApi {
  constructor(private readonly dependencies: { sourceRegistry: SourceRegistry; sourcePolicyEngine: SourcePolicyEngine; sourceHealthMonitor: SourceHealthMonitor }) {}

  async plan(input: { projectId: string; territoryId: string; domains: CanonicalDomain[] }): Promise<SourceSelectionDecision[]> {
    void input.projectId;
    const decisions: SourceSelectionDecision[] = [];
    for (const domain of [...new Set(input.domains)]) {
      const candidates: SourceCandidate[] = [];
      for (const source of this.dependencies.sourceRegistry.list()) {
        if (!supportsDomain(source.id, domain)) continue;
        let health = source.status;
        try { health = (await this.dependencies.sourceHealthMonitor.check(source.id)).status; } catch { health = "offline"; }
        candidates.push({
          sourceId: source.id,
          domain,
          available: health === "ready",
          coverageKnown: false,
          licenseAllowed: source.license !== "restricted",
          automationAllowed: source.automationPolicy?.allowed ?? true,
        });
      }
      const decision = this.dependencies.sourcePolicyEngine.decide({ domain, candidates, context: { territoryId: input.territoryId, automationRequired: true } });
      const reviewSource = decision.selectedSourceIds.some((sourceId) => this.dependencies.sourceRegistry.get(sourceId as DataSourceKind)?.automationPolicy?.requiresReview);
      // Unknown scores require explanation in the decision log, but do not
      // block automation. Only an explicit source policy review flag blocks.
      decisions.push({ ...decision, requiresManualReview: reviewSource });
    }
    return decisions;
  }
}

function supportsDomain(sourceId: DataSourceKind, domain: CanonicalDomain): boolean {
  if (sourceId === "ckan" || sourceId === "stac") return false;
  if (sourceId === "osm") return domain !== "imagery" && domain !== "terrain";
  if (sourceId === "microsoft-buildings" || sourceId === "local-buildings") return domain === "building";
  if (sourceId === "overture") return domain === "building" || domain === "poi" || domain === "road";
  if (sourceId === "wikidata") return domain === "poi" || domain === "transport_stop";
  if (sourceId === "gtfs") return domain === "transport_stop";
  if (sourceId === "copernicus-dem") return domain === "terrain";
  return true;
}
