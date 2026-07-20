import type { Geometry, Position } from "geojson";
import {
  addValue,
  DATA_HUB_STORES,
  deleteAllByIndex,
  getFormiqDatabase,
  readAllByIndex,
  readValue,
} from "@/lib/storage/indexedDbProjectStorage";
import type { CanonicalFeature, CanonicalQuery, CanonicalQueryResult, CanonicalSnapshot } from "../types";
import type { CanonicalRepository } from "./CanonicalRepository";
import { cloneForStorage, compareNewest } from "./repositoryUtils";

export class IndexedDbCanonicalRepository implements CanonicalRepository {
  async saveSnapshot(snapshot: CanonicalSnapshot): Promise<void> {
    const latest = await this.getLatestSnapshot({ projectId: snapshot.projectId, territoryId: snapshot.territoryId });
    if (latest && snapshot.version <= latest.version) {
      throw new Error(`Canonical snapshot version must be greater than ${latest.version}.`);
    }
    await addValue(
      await getFormiqDatabase(), DATA_HUB_STORES.CANONICAL_SNAPSHOTS, cloneForStorage(snapshot)
    );
  }

  async getSnapshot(id: string): Promise<CanonicalSnapshot | null> {
    return readValue(await getFormiqDatabase(), DATA_HUB_STORES.CANONICAL_SNAPSHOTS, id);
  }

  async getLatestSnapshot(input: { projectId: string; territoryId: string }): Promise<CanonicalSnapshot | null> {
    const snapshots = await readAllByIndex<CanonicalSnapshot>(
      await getFormiqDatabase(), DATA_HUB_STORES.CANONICAL_SNAPSHOTS, "projectId", input.projectId
    );
    return snapshots.filter((snapshot) => snapshot.territoryId === input.territoryId).sort(compareNewest)[0] ?? null;
  }

  async query(query: CanonicalQuery): Promise<CanonicalQueryResult> {
    const snapshot = await this.getLatestSnapshot(query);
    if (!snapshot) return { snapshotId: "", features: [] };
    const features = snapshot.features.filter((feature) =>
      (!query.domains || query.domains.includes(feature.domain)) &&
      (query.minConfidence === undefined || (feature.overallConfidence ?? 0) >= query.minConfidence) &&
      (!query.preferredOnly || feature.preferred) &&
      (!query.bbox || geometryIntersectsBbox(feature.geometry, query.bbox))
    );
    return { snapshotId: snapshot.id, features: cloneForStorage(features) };
  }

  async deleteByProject(projectId: string): Promise<void> {
    await deleteAllByIndex(
      await getFormiqDatabase(), DATA_HUB_STORES.CANONICAL_SNAPSHOTS, "projectId", projectId
    );
  }
}

function geometryIntersectsBbox(geometry: Geometry, bbox: [number, number, number, number]): boolean {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((item) => geometryIntersectsBbox(item, bbox));
  }
  const positions = collectPositions(geometry.coordinates);
  if (positions.length === 0) return false;
  const west = Math.min(...positions.map((position) => position[0]));
  const south = Math.min(...positions.map((position) => position[1]));
  const east = Math.max(...positions.map((position) => position[0]));
  const north = Math.max(...positions.map((position) => position[1]));
  return east >= bbox[0] && west <= bbox[2] && north >= bbox[1] && south <= bbox[3];
}

function collectPositions(value: Position | Position[] | Position[][] | Position[][][]): Position[] {
  if (typeof value[0] === "number") return [value as Position];
  return (value as Array<Position | Position[] | Position[][]>).flatMap(collectPositions);
}
