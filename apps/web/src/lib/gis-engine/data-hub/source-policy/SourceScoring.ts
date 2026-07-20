import type { SourceCandidate, SourcePolicyContext, SourcePolicyTemplate } from "./types";

export interface SourceScore {
  sourceId: string;
  score: number;
  knownMetricCount: number;
  reasons: string[];
  hardRejected: boolean;
}

const WEIGHTS = {
  availability: 0.2,
  coverage: 0.2,
  reliability: 0.15,
  freshness: 0.1,
  geometry: 0.1,
  attributes: 0.1,
  rateLimit: 0.1,
  cost: 0.05,
} as const;

export function scoreSource(
  candidate: SourceCandidate,
  template: SourcePolicyTemplate,
  context: SourcePolicyContext = {}
): SourceScore {
  const reasons: string[] = [];
  if (!candidate.available) return rejected(candidate.sourceId, "source unavailable");
  if (!candidate.licenseAllowed) return rejected(candidate.sourceId, "license is not allowed by policy");
  if (!candidate.automationAllowed) {
    return rejected(candidate.sourceId, "automated acquisition is not allowed by policy");
  }

  let score = 0;
  let knownMetricCount = 0;
  score += WEIGHTS.availability;
  knownMetricCount += 1;
  reasons.push("source is available");

  const metric = (value: number | undefined, weight: number, label: string) => {
    if (value === undefined || !Number.isFinite(value)) {
      score += weight * 0.5;
      reasons.push(`${label} is unknown; neutral score applied`);
      return;
    }
    knownMetricCount += 1;
    const normalized = Math.max(0, Math.min(1, value));
    score += weight * normalized;
    reasons.push(`${label}=${normalized.toFixed(2)}`);
  };
  metric(candidate.coverageKnown ? candidate.expectedCoverage : undefined, WEIGHTS.coverage, "coverage");
  metric(candidate.reliabilityScore, WEIGHTS.reliability, "reliability");
  metric(candidate.freshnessScore, WEIGHTS.freshness, "freshness");
  metric(candidate.geometrySuitability, WEIGHTS.geometry, "geometry suitability");
  metric(candidate.attributeSuitability, WEIGHTS.attributes, "attribute suitability");

  const ratePenalty = candidate.rateLimited ? 0 : 1;
  score += WEIGHTS.rateLimit * ratePenalty;
  reasons.push(candidate.rateLimited ? "rate limit penalty applied" : "no rate limit reported");
  const costPenalty = candidate.estimatedCost === undefined ? 0.5 : Math.max(0, 1 - Math.min(1, candidate.estimatedCost));
  score += WEIGHTS.cost * costPenalty;
  reasons.push(candidate.estimatedCost === undefined ? "cost is unknown; neutral score applied" : `cost factor=${costPenalty.toFixed(2)}`);

  if (template.preferredSourceIds.includes(candidate.sourceId)) {
    score = Math.min(1, score + 0.03);
    reasons.push("domain policy preference bonus applied");
  }
  if (context.territoryCoverage !== undefined && candidate.expectedCoverage !== undefined && candidate.expectedCoverage < context.territoryCoverage) {
    reasons.push("expected coverage is below territory target");
  }
  return { sourceId: candidate.sourceId, score: Math.max(0, Math.min(1, score)), knownMetricCount, reasons, hardRejected: false };
}

function rejected(sourceId: string, reason: string): SourceScore {
  return { sourceId, score: 0, knownMetricCount: 0, reasons: [reason], hardRejected: true };
}
