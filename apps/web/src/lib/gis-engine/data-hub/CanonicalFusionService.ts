import type { Geometry } from "geojson";
import type { DataSourceKind } from "@/types/formiq";
import { DataFusionEngine } from "@/lib/gis-engine/fusion/DataFusionEngine";
import type {
  SourceAdapterResult,
  SourceBuildingFeature,
  SourceFeature,
} from "@/lib/gis-engine/fusion/types";
import type {
  CanonicalDomain,
  CanonicalFeature,
  CanonicalFusionResult,
  CanonicalFusionServiceApi,
  CanonicalSnapshot,
  DataHubWarning,
  NormalizedSourceDataset,
  NormalizedSourceFeature,
  ProvenanceRecord,
} from "./types";

interface Candidate {
  normalized: NormalizedSourceFeature;
  sourceFeature: SourceFeature | null;
  sourceId: string;
  key: string;
}

export class CanonicalFusionService implements CanonicalFusionServiceApi {
  constructor(
    private readonly fusionEngine = new DataFusionEngine(null),
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async fuse(input: {
    projectId: string;
    territoryId: string;
    ingestionRunId: string;
    datasets: NormalizedSourceDataset[];
    previousSnapshot?: CanonicalSnapshot | null;
  }): Promise<CanonicalFusionResult> {
    const warnings: DataHubWarning[] = [];
    const candidates = toCandidates(input.datasets, warnings);
    const sourceResults = toSourceResults(candidates);
    const fusion = this.fusionEngine.fuseCollections(sourceResults);
    const previous = new Map((input.previousSnapshot?.features ?? []).map((feature) => [feature.id, feature]));
    const now = this.now();
    const features: CanonicalFeature[] = [];
    const conflicts: CanonicalFusionResult["conflicts"] = [];
    const consumed = new Set<string>();

    for (const group of fusion.buildingCandidateGroups) {
      const groupCandidates = group.map((item) => candidates.find((candidate) => candidate.key === sourceKey(item.source, item.sourceFeatureId)))
        .filter((candidate): candidate is Candidate => Boolean(candidate));
      if (groupCandidates.length === 0) continue;
      const fused = findFusedEntity(fusion.collections.buildings, group);
      const primarySource = fused?.provenance.primarySource;
      const primaryFeatureId = primarySource && primarySource !== "unknown"
        ? fused.provenance.sourceFeatureIds[primarySource]?.[0]
        : undefined;
      const preferredKey = primarySource && primaryFeatureId
        ? sourceKey(primarySource, primaryFeatureId)
        : groupCandidates[0].key;
      const preferredCandidate = groupCandidates.find((candidate) => candidate.key === preferredKey) ?? groupCandidates[0];
      const groupProvenance = [
        preferredCandidate.normalized.provenance,
        ...groupCandidates.filter((candidate) => candidate !== preferredCandidate).map((candidate) => candidate.normalized.provenance),
      ];
      const groupFeatures = groupCandidates.map((candidate) => {
        consumed.add(candidate.key);
        const preferred = candidate === preferredCandidate;
        return this.toCanonicalFeature({
          candidate,
          projectId: input.projectId,
          territoryId: input.territoryId,
          preferred,
          attributes: preferred && fused ? fusedAttributes(fused) : candidate.normalized.attributes,
          provenance: preferred ? groupProvenance : [candidate.normalized.provenance],
          previous,
          now,
        });
      });
      features.push(...groupFeatures);
      if (groupFeatures.length > 1) {
        const preferredFeature = groupFeatures.find((feature) => feature.preferred);
        conflicts.push({
          domain: "building",
          candidateFeatureIds: groupFeatures.map((feature) => feature.id),
          preferredFeatureId: preferredFeature?.id,
          reason: `Existing DataFusionEngine building overlap rule grouped the candidates; FusionPriorityRegistry selected "${preferredCandidate.sourceId}" for geometry.`,
        });
      }
    }

    for (const candidate of candidates) {
      if (consumed.has(candidate.key)) continue;
      const fused = candidate.sourceFeature
        ? findFusedEntity(collectionForDomain(fusion.collections, candidate.normalized.domain), [candidate.sourceFeature])
        : undefined;
      features.push(this.toCanonicalFeature({
        candidate,
        projectId: input.projectId,
        territoryId: input.territoryId,
        preferred: true,
        attributes: fused ? fusedAttributes(fused) : candidate.normalized.attributes,
        provenance: [candidate.normalized.provenance],
        previous,
        now,
      }));
    }

    return { features, conflicts, warnings };
  }

  private toCanonicalFeature(input: {
    candidate: Candidate;
    projectId: string;
    territoryId: string;
    preferred: boolean;
    attributes: Record<string, unknown>;
    provenance: ProvenanceRecord[];
    previous: Map<string, CanonicalFeature>;
    now: string;
  }): CanonicalFeature {
    const normalized = input.candidate.normalized;
    const generatedId = canonicalId(input.candidate);
    const prior = input.previous.get(generatedId) ?? findConfidentPrevious(input.previous, input.candidate);
    const id = prior?.id ?? generatedId;
    const nextState = {
      geometry: normalized.geometry,
      attributes: input.attributes,
      preferred: input.preferred,
      preferredSource: input.provenance[0]?.sourceId ?? input.candidate.sourceId,
    };
    const unchanged = prior ? stableStringify({
      geometry: prior.geometry,
      attributes: prior.attributes,
      preferred: prior.preferred,
      preferredSource: prior.provenance[0]?.sourceId ?? "",
    }) === stableStringify(nextState) : false;
    const geometryConfidence = normalized.geometryConfidence;
    const attributeConfidence = normalized.attributeConfidence;
    const scores = [geometryConfidence, attributeConfidence].filter((score): score is number => score !== null);

    return {
      id,
      domain: normalized.domain,
      geometry: structuredClone(normalized.geometry),
      attributes: structuredClone(input.attributes),
      projectId: input.projectId,
      territoryId: input.territoryId,
      provenance: structuredClone(input.provenance),
      geometryConfidence,
      attributeConfidence,
      overallConfidence: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : null,
      missingFields: [...normalized.missingFields],
      validationWarnings: [...normalized.validationWarnings],
      preferred: input.preferred,
      version: prior ? prior.version + (unchanged ? 0 : 1) : 1,
      createdAt: prior?.createdAt ?? input.now,
      updatedAt: unchanged && prior ? prior.updatedAt : input.now,
    };
  }
}

function toCandidates(datasets: NormalizedSourceDataset[], warnings: DataHubWarning[]): Candidate[] {
  return datasets.flatMap((dataset) => dataset.features.map((normalized) => {
    const sourceFeature = toSourceFeature(normalized, dataset.sourceId);
    if (!sourceFeature) {
      warnings.push({
        code: "FUSION_DOMAIN_UNSUPPORTED",
        message: `Existing DataFusionEngine has no merge rule for canonical domain "${normalized.domain}"; the candidate was preserved without cross-source fusion.`,
        sourceId: dataset.sourceId,
        domain: normalized.domain,
      });
    }
    const sourceFeatureId = sourceFeature?.sourceFeatureId ?? normalized.sourceFeatureId ?? `anonymous-${hash(stableStringify(normalized.geometry))}`;
    return {
      normalized,
      sourceFeature,
      sourceId: dataset.sourceId,
      key: sourceKey(dataset.sourceId, sourceFeatureId),
    };
  }));
}

function toSourceResults(candidates: Candidate[]): SourceAdapterResult[] {
  const grouped = new Map<string, SourceFeature[]>();
  for (const candidate of candidates) {
    if (!candidate.sourceFeature) continue;
    const features = grouped.get(candidate.sourceId) ?? [];
    features.push(candidate.sourceFeature);
    grouped.set(candidate.sourceId, features);
  }
  return [...grouped].map(([source, features]) => ({
    source: source as DataSourceKind,
    version: "data-hub-normalized-v1",
    features,
  }));
}

function toSourceFeature(feature: NormalizedSourceFeature, sourceId: string): SourceFeature | null {
  const attributes = feature.attributes;
  const tags = stringRecord(attributes.tags);
  const sourceFeatureId = feature.sourceFeatureId ?? `anonymous-${hash(stableStringify(feature.geometry))}`;
  const base = {
    source: sourceId as DataSourceKind,
    sourceFeatureId,
    geometry: feature.geometry,
    tags,
    names: typeof attributes.name === "string" ? { default: attributes.name } : undefined,
  };
  switch (feature.domain) {
    case "building": return { ...base, kind: "building", levels: numberOrNull(attributes.levels), height: numberOrNull(attributes.height), year: numberOrNull(attributes.year), usage: stringOrNull(attributes.usage), material: stringOrNull(attributes.material), roof: stringOrNull(attributes.roof), addressLabel: stringOrNull(attributes.addressLabel), objectType: stringOrNull(attributes.objectType) };
    case "road": return { ...base, kind: "road", roadType: stringOrNull(attributes.roadType), surface: stringOrNull(attributes.surface), name: stringOrNull(attributes.name), lanes: numberOrNull(attributes.lanes) };
    case "green_area": return { ...base, kind: "vegetation", vegetationType: stringOrNull(attributes.vegetationType) };
    case "waterbody": return { ...base, kind: "water", waterType: stringOrNull(attributes.waterType) };
    case "terrain": return { ...base, kind: "terrain", elevation: numberOrNull(attributes.elevation), slope: numberOrNull(attributes.slope) };
    case "boundary": return { ...base, kind: "boundary", adminLevel: stringOrNull(attributes.adminLevel), name: stringOrNull(attributes.name) };
    case "poi": return { ...base, kind: "poi", category: stringOrNull(attributes.category), subtype: stringOrNull(attributes.subtype), name: stringOrNull(attributes.name) };
    case "transport_stop": return { ...base, kind: "transit-stop", network: stringOrNull(attributes.network), stopType: stringOrNull(attributes.stopType), name: stringOrNull(attributes.name) };
    default: return null;
  }
}

type FusedEntity = ReturnType<DataFusionEngine["fuseCollections"]>["collections"][keyof ReturnType<DataFusionEngine["fuseCollections"]>["collections"]][number];

function findFusedEntity(collection: readonly FusedEntity[], candidates: SourceFeature[]): FusedEntity | undefined {
  return collection.find((entity) => candidates.some((candidate) =>
    entity.provenance.sourceFeatureIds[candidate.source]?.includes(candidate.sourceFeatureId)
  ));
}

function collectionForDomain(
  collections: ReturnType<DataFusionEngine["fuseCollections"]>["collections"],
  domain: CanonicalDomain
): readonly FusedEntity[] {
  if (domain === "building") return collections.buildings;
  if (domain === "road") return collections.roads;
  if (domain === "green_area") return collections.vegetation;
  if (domain === "waterbody") return collections.water;
  if (domain === "terrain") return collections.terrain;
  if (domain === "boundary") return collections.boundaries;
  if (domain === "poi") return collections.poi;
  if (domain === "transport_stop") return collections.transitStops;
  return [];
}

function fusedAttributes(entity: FusedEntity): Record<string, unknown> {
  const { id: _id, type: _type, geometry: _geometry, source: _source, provenance: _provenance, confidence: _confidence, lifecycleState: _lifecycle, ...attributes } = entity;
  return attributes;
}

function canonicalId(candidate: Candidate): string {
  const identity = candidate.normalized.sourceFeatureId ?? hash(stableStringify(candidate.normalized.geometry));
  return `canonical:${candidate.normalized.domain}:${encodeURIComponent(candidate.sourceId)}:${encodeURIComponent(identity)}`;
}

function findConfidentPrevious(
  previous: Map<string, CanonicalFeature>,
  candidate: Candidate
): CanonicalFeature | undefined {
  const geometry = stableStringify(candidate.normalized.geometry);
  const matches = [...previous.values()].filter((feature) =>
    feature.domain === candidate.normalized.domain &&
    feature.provenance.some((provenance) => provenance.sourceId === candidate.sourceId) &&
    stableStringify(feature.geometry) === geometry
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function sourceKey(sourceId: string, featureId: string): string {
  return `${sourceId}\u0000${featureId}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
