import {
  addValue,
  addValues,
  DATA_HUB_STORES,
  deleteAllByIndex,
  getFormiqDatabase,
  readAllByIndex,
  readValue,
} from "@/lib/storage/indexedDbProjectStorage";
import type { RawDataRecord } from "../types";
import type { RawDataRepository } from "./RawDataRepository";
import { cloneForStorage, compareNewest, estimateSerializedBytes, RAW_PAYLOAD_WARNING_BYTES } from "./repositoryUtils";

export class IndexedDbRawDataRepository implements RawDataRepository {
  async save(record: RawDataRecord): Promise<void> {
    await addValue(await getFormiqDatabase(), DATA_HUB_STORES.RAW_RECORDS, prepareRawRecord(record));
  }

  async saveMany(records: RawDataRecord[]): Promise<void> {
    await addValues(
      await getFormiqDatabase(),
      DATA_HUB_STORES.RAW_RECORDS,
      records.map(prepareRawRecord)
    );
  }

  async get(id: string): Promise<RawDataRecord | null> {
    return readValue(await getFormiqDatabase(), DATA_HUB_STORES.RAW_RECORDS, id);
  }

  async listByRun(ingestionRunId: string): Promise<RawDataRecord[]> {
    const records = await readAllByIndex<RawDataRecord>(
      await getFormiqDatabase(), DATA_HUB_STORES.RAW_RECORDS, "ingestionRunId", ingestionRunId
    );
    return records.sort(compareNewest);
  }

  async listByTerritory(input: {
    projectId: string;
    territoryId: string;
    sourceId?: string;
    domain?: RawDataRecord["domain"];
  }): Promise<RawDataRecord[]> {
    const records = await readAllByIndex<RawDataRecord>(
      await getFormiqDatabase(), DATA_HUB_STORES.RAW_RECORDS, "projectId", input.projectId
    );
    return records
      .filter((record) =>
        record.territoryId === input.territoryId &&
        (!input.sourceId || record.sourceId === input.sourceId) &&
        (!input.domain || record.domain === input.domain)
      )
      .sort(compareNewest);
  }

  async deleteByProject(projectId: string): Promise<void> {
    await deleteAllByIndex(await getFormiqDatabase(), DATA_HUB_STORES.RAW_RECORDS, "projectId", projectId);
  }
}

function prepareRawRecord(record: RawDataRecord): RawDataRecord {
  const cloned = cloneForStorage(record);
  const payloadBytes = estimateSerializedBytes(cloned.payload);
  if (payloadBytes !== null && payloadBytes >= RAW_PAYLOAD_WARNING_BYTES) {
    cloned.sourceMetadata = {
      ...cloned.sourceMetadata,
      storageWarning: `Raw payload is ${payloadBytes} bytes; future ingestion should chunk this source response.`,
      payloadBytes,
    };
  }
  return cloned;
}
