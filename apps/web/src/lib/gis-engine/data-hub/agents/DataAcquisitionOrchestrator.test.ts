import { describe, expect, it } from "vitest";
import { DataAcquisitionOrchestrator } from "./DataAcquisitionOrchestrator";
import { InMemoryAgentJobRepository } from "./AgentJobRepository";
import type {
  AcquisitionExecutionAgent,
  AgentOrchestratorDependencies,
  CoverageAssessmentAgent,
  QualityReviewAgent,
  SourcePlanningAgent,
} from "./types";
import type { DataHubApi, TerritoryReference } from "../types";

const territory: TerritoryReference = { id: "territory-1", projectId: "project-1", bbox: [0, 0, 1, 1], geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, crs: "EPSG:4326" };
const dataHub = {} as DataHubApi;

function deps(overrides: Partial<AgentOrchestratorDependencies> = {}): AgentOrchestratorDependencies {
  const coverage: CoverageAssessmentAgent = { assess: async () => ({ missingDomains: [], partialDomains: [], outdatedDomains: [], belowThresholdDomains: [], coveredDomains: ["building"], warnings: [] }) };
  const planning: SourcePlanningAgent = { plan: async (input) => input.domains.map((domain) => ({ domain, selectedSourceIds: ["osm"], rejectedSourceIds: [], reasons: { osm: ["test"] }, fallbackSourceIds: [], requiresManualReview: false })) };
  const execution: AcquisitionExecutionAgent = { execute: async () => undefined, cancel: async () => undefined };
  const review: QualityReviewAgent = { review: async () => ({ sufficient: true, missingRequirements: [], manualReviewRequired: false, warnings: [] }) };
  return { jobRepository: new InMemoryAgentJobRepository(), dataHub, coverageAssessment: coverage, sourcePlanning: planning, acquisitionExecution: execution, qualityReview: review, sleep: async () => undefined, ...overrides };
}

describe("DataAcquisitionOrchestrator", () => {
  it("completes when coverage is already sufficient", async () => {
    const d = deps();
    const job = await new DataAcquisitionOrchestrator(d).startAcquisition({ projectId: "project-1", territory, requestedDomains: ["building"] });
    expect(job.status).toBe("completed");
    expect((await d.jobRepository.get(job.id))?.status).toBe("completed");
  });

  it("waits for manual review when policy has no automated source", async () => {
    const planning: SourcePlanningAgent = { plan: async () => [{ domain: "building", selectedSourceIds: [], rejectedSourceIds: ["manual"], reasons: { manual: ["manual review"] }, fallbackSourceIds: [], requiresManualReview: true }] };
    const d = deps({ sourcePlanning: planning, coverageAssessment: { assess: async () => ({ missingDomains: ["building"], partialDomains: [], outdatedDomains: [], belowThresholdDomains: [], coveredDomains: [], warnings: [] }) } });
    const job = await new DataAcquisitionOrchestrator(d).startAcquisition({ projectId: "project-1", territory, requestedDomains: ["building"] });
    expect(job.status).toBe("waiting_manual_review");
  });

  it("does not retry forever and preserves a partial result", async () => {
    let attempts = 0;
    const d = deps({
      coverageAssessment: { assess: async () => ({ missingDomains: ["building"], partialDomains: [], outdatedDomains: [], belowThresholdDomains: [], coveredDomains: [], warnings: [] }) },
      acquisitionExecution: { execute: async () => { attempts += 1; }, cancel: async () => undefined },
      qualityReview: { review: async () => ({ sufficient: false, missingRequirements: [{ domain: "building", required: true }], manualReviewRequired: false, warnings: [] }) },
    });
    const job = await new DataAcquisitionOrchestrator(d).startAcquisition({ projectId: "project-1", territory, requestedDomains: ["building"], maxAttempts: 2 });
    expect(attempts).toBe(2);
    expect(job.status).toBe("failed");
  });

  it("marks cancellation and keeps the job record", async () => {
    let resolveExecution!: () => void;
    const execution: AcquisitionExecutionAgent = { execute: async () => new Promise<void>((resolve) => { resolveExecution = resolve; }), cancel: async () => { resolveExecution?.(); } };
    const d = deps({ coverageAssessment: { assess: async () => ({ missingDomains: ["building"], partialDomains: [], outdatedDomains: [], belowThresholdDomains: [], coveredDomains: [], warnings: [] }) }, acquisitionExecution: execution });
    const orchestrator = new DataAcquisitionOrchestrator(d);
    const pending = orchestrator.startAcquisition({ projectId: "project-1", territory, requestedDomains: ["building"] });
    const [created] = await d.jobRepository.listByProject("project-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await orchestrator.cancelJob(created.id);
    const job = await pending;
    expect(job.status).toBe("cancelled");
  });
});
