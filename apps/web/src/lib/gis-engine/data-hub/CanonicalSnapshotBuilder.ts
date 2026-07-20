import type { CanonicalRepository, IngestionRunRepository } from "./repositories";
import type {
  CanonicalFeature,
  CanonicalSnapshot,
  CanonicalSnapshotBuilderApi,
} from "./types";

export class CanonicalSnapshotBuilder implements CanonicalSnapshotBuilderApi {
  constructor(
    private readonly canonicalRepository: CanonicalRepository,
    private readonly ingestionRunRepository: IngestionRunRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  async buildAndSave(input: {
    projectId: string;
    territoryId: string;
    ingestionRunId: string;
    features: CanonicalFeature[];
    previousSnapshot?: CanonicalSnapshot | null;
  }): Promise<CanonicalSnapshot> {
    const run = await this.ingestionRunRepository.get(input.ingestionRunId);
    if (!run) throw new Error(`Ingestion run "${input.ingestionRunId}" does not exist.`);
    if (run.projectId !== input.projectId || run.territoryId !== input.territoryId) {
      throw new Error("Ingestion run does not belong to the requested project and territory.");
    }

    const previous = input.previousSnapshot === undefined
      ? await this.canonicalRepository.getLatestSnapshot({ projectId: input.projectId, territoryId: input.territoryId })
      : input.previousSnapshot;
    const version = (previous?.version ?? 0) + 1;
    const snapshot = deepFreeze<CanonicalSnapshot>({
      id: `canonical-snapshot:${encodeURIComponent(input.projectId)}:${encodeURIComponent(input.territoryId)}:${version}:${this.createId()}`,
      projectId: input.projectId,
      territoryId: input.territoryId,
      ingestionRunId: input.ingestionRunId,
      createdAt: this.now(),
      version,
      features: structuredClone(input.features),
    });

    await this.canonicalRepository.saveSnapshot(snapshot);
    await this.ingestionRunRepository.update({ ...run, canonicalSnapshotId: snapshot.id });
    return snapshot;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
