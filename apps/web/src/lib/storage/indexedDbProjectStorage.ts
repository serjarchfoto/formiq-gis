import { normalizeFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type { LayerChunkManifest, LayerChunkRecord } from "@/lib/gis-engine/chunks";
import type { FormiqProjectData } from "@/types/formiq";

const DATABASE_NAME = "formiq-workspace";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const META_STORE = "metadata";
const LAYER_CHUNK_STORE = "layer-chunks";
const LAYER_CHUNK_MANIFEST_STORE = "layer-chunk-manifests";
const ACTIVE_PROJECT_KEY = "active-project-id";
let databasePromise: Promise<IDBDatabase> | null = null;

export class IndexedDbProjectStorage {
  async loadAllProjects(): Promise<FormiqProjectData[]> {
    if (!canUseIndexedDb()) {
      return [];
    }

    const database = await getDatabase();
    const projects = await readAllValues<FormiqProjectData>(database, PROJECT_STORE);

    return projects
      .map((project) => normalizeFormiqProject(project))
      .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt));
  }

  async loadActiveProject(): Promise<FormiqProjectData | null> {
    if (!canUseIndexedDb()) {
      return null;
    }

    const database = await getDatabase();
    const activeProjectId = await readValue<string>(database, META_STORE, ACTIVE_PROJECT_KEY);

    if (!activeProjectId) {
      return null;
    }

    const project = await readValue<FormiqProjectData>(database, PROJECT_STORE, activeProjectId);

    return project ? normalizeFormiqProject(project) : null;
  }

  async loadProject(projectId: string): Promise<FormiqProjectData | null> {
    if (!canUseIndexedDb()) {
      return null;
    }

    const database = await getDatabase();
    const project = await readValue<FormiqProjectData>(database, PROJECT_STORE, projectId);

    return project ? normalizeFormiqProject(project) : null;
  }

  async saveProject(project: FormiqProjectData): Promise<FormiqProjectData> {
    const preparedProject = prepareProjectForStorage(project);

    if (!canUseIndexedDb()) {
      return preparedProject;
    }

    const database = await getDatabase();

    markPerformance("project-persist-start");
    await writeProjectAndActiveProjectId(database, preparedProject);
    markPerformance("project-persisted");
    measurePerformance("project-persist-duration", "project-persist-start", "project-persisted");
    return preparedProject;
  }

  async saveProjectRecord(project: FormiqProjectData): Promise<FormiqProjectData> {
    const preparedProject = prepareProjectForStorage(project);

    if (!canUseIndexedDb()) {
      return preparedProject;
    }

    const database = await getDatabase();
    await writeValue(database, PROJECT_STORE, preparedProject);
    return preparedProject;
  }

  async setActiveProjectId(projectId: string): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await getDatabase();
    await writeValue(database, META_STORE, {
      id: ACTIVE_PROJECT_KEY,
      value: projectId,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await getDatabase();
    const activeProjectId = await readValue<string>(database, META_STORE, ACTIVE_PROJECT_KEY);
    const projectsBeforeDelete = await readAllValues<FormiqProjectData>(database, PROJECT_STORE);
    const projectsAfterDelete = projectsBeforeDelete.filter((project) => project.id !== projectId);
    await deleteLayerChunksForProject(database, projectId);

    if (activeProjectId === projectId) {
      const nextActiveProject = projectsAfterDelete
        .map((project) => normalizeFormiqProject(project))
        .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt))[0];

      await deleteProjectAndUpdateActiveProjectId(database, projectId, nextActiveProject?.id ?? null);
      return;
    }

    await deleteValue(database, PROJECT_STORE, projectId);
  }
}

export class IndexedDbLayerChunkStorage {
  async saveChunk(chunk: LayerChunkRecord): Promise<LayerChunkManifest> {
    const manifest = toChunkManifest(chunk);
    if (!canUseIndexedDb()) return manifest;

    const database = await getDatabase();
    const writeStart = `layer-chunk-write-start:${chunk.id}`;
    const writeEnd = `layer-chunk-write-end:${chunk.id}`;
    markPerformance(writeStart);
    await writeLayerChunk(database, chunk, manifest);
    markPerformance(writeEnd);
    measurePerformance(
      `layer-chunk-write-duration:${chunk.id}`,
      writeStart,
      writeEnd
    );
    return manifest;
  }

  async loadChunk(chunkId: string): Promise<LayerChunkRecord | null> {
    if (!canUseIndexedDb()) return null;
    return readValue<LayerChunkRecord>(await getDatabase(), LAYER_CHUNK_STORE, chunkId);
  }

  async loadProjectManifests(projectId: string): Promise<LayerChunkManifest[]> {
    if (!canUseIndexedDb()) return [];
    const database = await getDatabase();
    return readAllByIndex<LayerChunkManifest>(
      database,
      LAYER_CHUNK_MANIFEST_STORE,
      "projectId",
      projectId
    );
  }

  async deleteProjectChunks(projectId: string): Promise<void> {
    if (!canUseIndexedDb()) return;
    await deleteLayerChunksForProject(await getDatabase(), projectId);
  }
}

export const layerChunkStorage = new IndexedDbLayerChunkStorage();

function writeProjectAndActiveProjectId(
  database: IDBDatabase,
  project: FormiqProjectData
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECT_STORE, META_STORE], "readwrite");

    transaction.objectStore(PROJECT_STORE).put(project);
    transaction.objectStore(META_STORE).put({
      id: ACTIVE_PROJECT_KEY,
      value: project.id,
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteProjectAndUpdateActiveProjectId(
  database: IDBDatabase,
  projectId: string,
  nextActiveProjectId: string | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECT_STORE, META_STORE], "readwrite");

    transaction.objectStore(PROJECT_STORE).delete(projectId);

    if (nextActiveProjectId) {
      transaction.objectStore(META_STORE).put({
        id: ACTIVE_PROJECT_KEY,
        value: nextActiveProjectId,
      });
    } else {
      transaction.objectStore(META_STORE).delete(ACTIVE_PROJECT_KEY);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function getDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(LAYER_CHUNK_STORE)) {
        const chunks = database.createObjectStore(LAYER_CHUNK_STORE, { keyPath: "id" });
        chunks.createIndex("projectId", "projectId", { unique: false });
        chunks.createIndex("project-layer", ["projectId", "layerType"], { unique: false });
        chunks.createIndex("project-layer-tile", ["projectId", "layerType", "tileId"], { unique: false });
      }

      if (!database.objectStoreNames.contains(LAYER_CHUNK_MANIFEST_STORE)) {
        const manifests = database.createObjectStore(LAYER_CHUNK_MANIFEST_STORE, { keyPath: "id" });
        manifests.createIndex("projectId", "projectId", { unique: false });
        manifests.createIndex("project-layer", ["projectId", "layerType"], { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });
}

export function prepareProjectForStorage(project: FormiqProjectData): FormiqProjectData {
  const normalizedProject = normalizeFormiqProject(project);
  const metadata = { ...normalizedProject.metadata };
  delete metadata.serializedSize;
  const projectWithoutCachedSize = { ...normalizedProject, metadata };
  const serializedSize = new TextEncoder().encode(JSON.stringify(projectWithoutCachedSize)).byteLength;

  return {
    ...projectWithoutCachedSize,
    metadata: {
      ...metadata,
      serializedSize,
    },
  };
}

function markPerformance(name: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMarks(name);
  performance.mark(name);
}

function measurePerformance(name: string, startMark: string, endMark: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMeasures(name);
  performance.measure(name, startMark, endMark);
}

function readValue<T>(database: IDBDatabase, storeName: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => {
      if (!request.result) {
        resolve(null);
        return;
      }

      if (storeName === META_STORE) {
        resolve(request.result.value as T);
        return;
      }

      resolve(request.result as T);
    };

    request.onerror = () => reject(request.error);
  });
}

function readAllValues<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function writeValue(
  database: IDBDatabase,
  storeName: string,
  value: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function writeLayerChunk(
  database: IDBDatabase,
  chunk: LayerChunkRecord,
  manifest: LayerChunkManifest
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [LAYER_CHUNK_STORE, LAYER_CHUNK_MANIFEST_STORE],
      "readwrite"
    );
    transaction.objectStore(LAYER_CHUNK_STORE).put(chunk);
    transaction.objectStore(LAYER_CHUNK_MANIFEST_STORE).put(manifest);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function readAllByIndex<T>(
  database: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).index(indexName).getAll(key);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function deleteLayerChunksForProject(database: IDBDatabase, projectId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [LAYER_CHUNK_STORE, LAYER_CHUNK_MANIFEST_STORE],
      "readwrite"
    );
    deleteByIndex(transaction.objectStore(LAYER_CHUNK_STORE), "projectId", projectId);
    deleteByIndex(transaction.objectStore(LAYER_CHUNK_MANIFEST_STORE), "projectId", projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteByIndex(store: IDBObjectStore, indexName: string, key: IDBValidKey): void {
  const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(key));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function toChunkManifest(chunk: LayerChunkRecord): LayerChunkManifest {
  const { geojson: _geojson, ...manifest } = chunk;
  void _geojson;
  return manifest;
}

function deleteValue(database: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
