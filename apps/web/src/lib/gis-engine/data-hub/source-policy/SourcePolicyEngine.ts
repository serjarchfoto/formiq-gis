import type { CanonicalDomain } from "../types";
import { DEFAULT_SOURCE_POLICY_TEMPLATES } from "./defaultPolicies";
import { scoreSource, type SourceScore } from "./SourceScoring";
import type { SourceCandidate, SourcePolicyContext, SourcePolicyTemplate, SourceSelectionDecision } from "./types";

export class SourcePolicyEngine {
  constructor(private readonly templates: Partial<Record<CanonicalDomain, SourcePolicyTemplate>> = DEFAULT_SOURCE_POLICY_TEMPLATES) {}

  decide(input: { domain: CanonicalDomain; candidates: SourceCandidate[]; context?: SourcePolicyContext }): SourceSelectionDecision {
    const template = this.templates[input.domain] ?? fallbackTemplate(input.domain);
    const scores = input.candidates.map((candidate) => scoreSource(candidate, template, input.context));
    const reasons: Record<string, string[]> = Object.fromEntries(scores.map((score) => [score.sourceId, score.reasons]));
    const eligible = scores.filter((score) => !score.hardRejected).sort((left, right) => right.score - left.score || left.sourceId.localeCompare(right.sourceId));
    const selected = eligible.filter((score) => score.score >= template.selectionThreshold).slice(0, template.maximumSources);
    const minimum = Math.min(template.minimumSources, eligible.length);
    for (const score of eligible) {
      if (selected.length >= minimum) break;
      if (!selected.includes(score)) selected.push(score);
    }
    const selectedIds = selected.map((score) => score.sourceId);
    const availableRejected = scores.filter((score) => !score.hardRejected && !selectedIds.includes(score.sourceId));
    const hardRejected = scores.filter((score) => score.hardRejected);
    for (const score of hardRejected) reasons[score.sourceId] = [...score.reasons, "hard constraint: source cannot be selected"];
    const fallbackSourceIds = availableRejected.map((score) => score.sourceId);
    return {
      domain: input.domain,
      selectedSourceIds: selectedIds,
      rejectedSourceIds: [...hardRejected.map((score) => score.sourceId), ...fallbackSourceIds],
      reasons,
      fallbackSourceIds,
      requiresManualReview: selected.length === 0 || selected.some((score) => score.knownMetricCount < 6),
    };
  }
}

function fallbackTemplate(domain: CanonicalDomain): SourcePolicyTemplate {
  return { domain, preferredSourceIds: [], minimumSources: 1, maximumSources: 3, selectionThreshold: 0.62 };
}

export type { SourceScore };
