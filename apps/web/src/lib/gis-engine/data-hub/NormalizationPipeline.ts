import { GenericGeoJsonNormalizer, OSMSourceNormalizer } from "./normalizers";
import type {
  NormalizationContext,
  NormalizationPipelineApi,
  NormalizedSourceDataset,
  SourceFetchEnvelope,
  SourceNormalizer,
  RawDataRecord,
} from "./types";

export class NormalizationPipeline implements NormalizationPipelineApi {
  constructor(private readonly normalizers: SourceNormalizer[] = [
    new OSMSourceNormalizer(),
    new GenericGeoJsonNormalizer(),
  ]) {}

  async normalize(input: {
    envelope: SourceFetchEnvelope;
    rawRecord: RawDataRecord;
    signal?: AbortSignal;
  }): Promise<NormalizedSourceDataset> {
    if (input.signal?.aborted) throw new DOMException("Normalization was aborted.", "AbortError");
    const context = createContext(input.envelope, input.rawRecord);
    const normalizer = this.normalizers.find((candidate) => candidate.supports(context));
    if (!normalizer) {
      throw new Error(`No normalizer supports source "${context.sourceId}" and domain "${context.domain}".`);
    }
    return normalizer.normalize([input.rawRecord], context);
  }
}

function createContext(envelope: SourceFetchEnvelope, rawRecord: RawDataRecord): NormalizationContext {
  const sourceType = typeof envelope.metadata.sourceType === "string"
    ? envelope.metadata.sourceType
    : envelope.sourceId === "osm" ? "osm" : envelope.sourceId;
  return {
    projectId: rawRecord.projectId,
    territoryId: rawRecord.territoryId,
    ingestionRunId: rawRecord.ingestionRunId,
    sourceId: envelope.sourceId,
    sourceType,
    domain: envelope.domain,
    rawRecordId: rawRecord.id,
    acquiredAt: rawRecord.receivedAt,
  };
}
