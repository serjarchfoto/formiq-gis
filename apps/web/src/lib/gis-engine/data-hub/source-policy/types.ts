import type { CanonicalDomain } from "../types";

export interface SourceCandidate {
  sourceId: string;
  domain: CanonicalDomain;
  available: boolean;
  coverageKnown: boolean;
  expectedCoverage?: number;
  reliabilityScore?: number;
  freshnessScore?: number;
  geometrySuitability?: number;
  attributeSuitability?: number;
  licenseAllowed: boolean;
  automationAllowed: boolean;
  estimatedCost?: number;
  rateLimited?: boolean;
}

export interface SourceSelectionDecision {
  domain: CanonicalDomain;
  selectedSourceIds: string[];
  rejectedSourceIds: string[];
  reasons: Record<string, string[]>;
  fallbackSourceIds: string[];
  requiresManualReview: boolean;
}

export interface SourcePolicyTemplate {
  domain: CanonicalDomain;
  /** Hints only; these never bypass candidate constraints or scoring. */
  preferredSourceIds: string[];
  minimumSources: number;
  maximumSources: number;
  selectionThreshold: number;
}

export interface SourcePolicyContext {
  territoryId?: string;
  territoryCoverage?: number;
  allowedLicenses?: string[];
  automationRequired?: boolean;
}
