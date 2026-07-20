import type { Geometry } from "geojson";
import {
  DataHubQueryService,
  IndexedDbCanonicalRepository,
  IndexedDbQualityRepository,
  projectCanonicalFeatures,
  type AnalysisDataRequirement,
  type CanonicalDomain,
  type CanonicalFeature,
  type DataHubAnalysisContext,
  type DataHubQueryServiceApi,
  type DomainQuality,
  type TerritoryReference,
} from "@/lib/gis-engine/data-hub";
import type { FormiqEntity, FormiqProjectData } from "@/types/formiq";
import { getAnalysisDefinition } from "./AnalysisRequirementsRegistry";
import type { AnalysisContext } from "./types";

export interface AnalysisContextAdapterInput {
  analysisId: string;
  project: FormiqProjectData;
  territory: TerritoryReference;
}

export class DataHubAnalysisContextAdapter {
  constructor(
    private readonly queryService: DataHubQueryServiceApi = new DataHubQueryService(
      new IndexedDbCanonicalRepository(),
      new IndexedDbQualityRepository()
    )
  ) {}

  async hasCanonicalSnapshot(input: Pick<AnalysisContextAdapterInput, "project" | "territory">): Promise<boolean> {
    return Boolean(await this.queryService.getLatestSnapshot({
      projectId: input.project.id,
      territoryId: input.territory.id,
    }));
  }

  async load(input: AnalysisContextAdapterInput): Promise<AnalysisContext> {
    const definition = getAnalysisDefinition(input.analysisId);
    const dataHub = await this.queryService.queryAnalysisContext({
      projectId: input.project.id,
      territoryId: input.territory.id,
      requirements: definition.requirements,
    });
    const collections = projectCanonicalFeatures(Object.values(dataHub.features).flatMap((features) => features ?? []));
    return {
      analysisId: input.analysisId,
      project: createAnalysisProject(input.project, collections),
      dataHub,
      source: "canonical",
      warnings: dataHub.warnings,
    };
  }
}

/** Temporary compatibility path for projects created before canonical snapshots existed. */
export class LegacyProjectAnalysisContextAdapter {
  async load(input: AnalysisContextAdapterInput): Promise<AnalysisContext> {
    const definition = getAnalysisDefinition(input.analysisId);
    const features = legacyFeatures(input.project, input.territory.id);
    const grouped = groupFeatures(features);
    const quality = legacyQuality(input.project.id, input.territory.id, grouped);
    const missingRequirements = definition.requirements.filter((requirement) =>
      requirementMissing(requirement, grouped)
    );
    const dataHub: DataHubAnalysisContext = {
      projectId: input.project.id,
      territoryId: input.territory.id,
      snapshotId: `legacy:${input.project.id}:${input.territory.id}`,
      features: grouped,
      quality,
      ready: !missingRequirements.some((requirement) => requirement.required && !(grouped[requirement.domain]?.length)),
      degraded: true,
      missingRequirements,
      warnings: ["Legacy project data has unknown canonical quality and provenance method legacy."],
    };
    return {
      analysisId: input.analysisId,
      project: createAnalysisProject(input.project, projectCanonicalFeatures(features)),
      dataHub,
      source: "legacy",
      warnings: dataHub.warnings,
    };
  }
}

export class AnalysisContextResolver {
  constructor(
    private readonly canonical = new DataHubAnalysisContextAdapter(),
    private readonly legacy = new LegacyProjectAnalysisContextAdapter()
  ) {}

  async load(input: AnalysisContextAdapterInput): Promise<AnalysisContext> {
    if (await this.canonical.hasCanonicalSnapshot(input)) return this.canonical.load(input);
    return this.legacy.load(input);
  }
}

function createAnalysisProject(
  project: FormiqProjectData,
  collections: ReturnType<typeof projectCanonicalFeatures>
): FormiqProjectData {
  return {
    ...project,
    territories: project.territories.filter((territory) => territory.id === project.activeTerritoryId),
    layers: [],
    layerSystem: [],
    fusion: null,
    buildings: collections.buildings,
    roads: collections.roads,
    vegetation: collections.vegetation,
    water: collections.water,
    terrain: collections.terrain,
    boundaries: collections.boundaries,
    poi: collections.poi,
    transitStops: collections.transitStops,
  };
}

function legacyFeatures(project: FormiqProjectData, territoryId: string): CanonicalFeature[] {
  const now = project.metadata.updatedAt;
  return [
    ...project.buildings, ...project.roads, ...project.vegetation, ...project.water,
    ...project.terrain, ...project.boundaries, ...project.poi, ...project.transitStops,
  ].map((entity) => ({
    id: `legacy:${entity.id}`,
    domain: legacyDomain(entity),
    geometry: toGeoJsonGeometry(entity),
    attributes: legacyAttributes(entity),
    projectId: project.id,
    territoryId,
    provenance: [{
      sourceId: "legacy-project",
      sourceType: "legacy",
      sourceFeatureId: entity.id,
      acquiredAt: now,
      processedAt: now,
      acquisitionMethod: "legacy",
      transformationSteps: ["LegacyProjectAnalysisContextAdapter"],
    }],
    geometryConfidence: null,
    attributeConfidence: null,
    overallConfidence: null,
    missingFields: [],
    validationWarnings: ["Legacy project feature was not evaluated by Data Hub QualityEngine."],
    preferred: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
}

function legacyDomain(entity: FormiqEntity): CanonicalDomain {
  if (entity.type === "vegetation") return "green_area";
  if (entity.type === "water") return "waterbody";
  if (entity.type === "transit-stop") return "transport_stop";
  return entity.type;
}

function toGeoJsonGeometry(entity: FormiqEntity): Geometry {
  const geometry = entity.geometry;
  if (geometry.type === "point") return { type: "Point", coordinates: geometry.coordinates };
  if (geometry.type === "line") return { type: "LineString", coordinates: geometry.coordinates };
  return { type: "Polygon", coordinates: geometry.rings };
}

function legacyAttributes(entity: FormiqEntity): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entity).filter(([key]) => key !== "geometry" && key !== "provenance"));
}

function groupFeatures(features: CanonicalFeature[]): DataHubAnalysisContext["features"] {
  return features.reduce<DataHubAnalysisContext["features"]>((result, feature) => {
    (result[feature.domain] ??= []).push(feature);
    return result;
  }, {});
}

function legacyQuality(
  projectId: string,
  territoryId: string,
  features: DataHubAnalysisContext["features"]
): DataHubAnalysisContext["quality"] {
  const domains = Object.fromEntries(Object.entries(features).map(([domain, values]) => [
    domain,
    unknownDomainQuality(domain as CanonicalDomain, values?.length ?? 0),
  ]));
  return {
    id: `legacy-quality:${projectId}:${territoryId}`,
    projectId,
    territoryId,
    canonicalSnapshotId: `legacy:${projectId}:${territoryId}`,
    createdAt: new Date().toISOString(),
    overallStatus: "degraded",
    overallScore: null,
    domains,
  };
}

function unknownDomainQuality(domain: CanonicalDomain, featureCount: number): DomainQuality {
  return {
    domain, status: featureCount ? "degraded" : "empty", featureCount,
    coverageScore: null, geometryScore: null, attributeScore: null, freshnessScore: null,
    sourceReliabilityScore: null, overallScore: null, measurement: "unknown",
    measurements: { coverage: "unknown", geometry: "unknown", attributes: "unknown", freshness: "unknown", sourceReliability: "unknown", overall: "unknown" },
    missingRequirements: [], warnings: ["Legacy quality is unknown."], sourceIds: ["legacy-project"],
  };
}

function requirementMissing(
  requirement: AnalysisDataRequirement,
  features: DataHubAnalysisContext["features"]
): boolean {
  return (features[requirement.domain]?.length ?? 0) === 0 ||
    requirement.minimumCoverage !== undefined || requirement.minimumQuality !== undefined;
}
