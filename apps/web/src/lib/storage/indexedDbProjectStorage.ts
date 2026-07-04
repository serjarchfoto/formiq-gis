import { normalizeFormiqProject } from "@/lib/gis-engine/projectBuilder";
import type { FormiqProjectData } from "@/types/formiq";

const DATABASE_NAME = "formiq-workspace";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const META_STORE = "metadata";
const ACTIVE_PROJECT_KEY = "active-project-id";

export class IndexedDbProjectStorage {
  async loadAllProjects(): Promise<FormiqProjectData[]> {
    if (!canUseIndexedDb()) {
      return [];
    }

    const database = await openDatabase();
    const projects = await readAllValues<FormiqProjectData>(database, PROJECT_STORE);

    return projects
      .map((project) => normalizeFormiqProject(project))
      .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt));
  }

  async loadActiveProject(): Promise<FormiqProjectData | null> {
    if (!canUseIndexedDb()) {
      return null;
    }

    const database = await openDatabase();
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

    const database = await openDatabase();
    const project = await readValue<FormiqProjectData>(database, PROJECT_STORE, projectId);

    return project ? normalizeFormiqProject(project) : null;
  }

  async saveProject(project: FormiqProjectData): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await openDatabase();
    const normalizedProject = normalizeFormiqProject(project);

    await writeProjectAndActiveProjectId(database, normalizedProject);
  }

  async saveProjectRecord(project: FormiqProjectData): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await openDatabase();
    await writeValue(database, PROJECT_STORE, normalizeFormiqProject(project));
  }

  async setActiveProjectId(projectId: string): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await openDatabase();
    await writeValue(database, META_STORE, {
      id: ACTIVE_PROJECT_KEY,
      value: projectId,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!canUseIndexedDb()) {
      return;
    }

    const database = await openDatabase();
    const activeProjectId = await readValue<string>(database, META_STORE, ACTIVE_PROJECT_KEY);
    const projectsBeforeDelete = await readAllValues<FormiqProjectData>(database, PROJECT_STORE);
    const projectsAfterDelete = projectsBeforeDelete.filter((project) => project.id !== projectId);

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
  value: FormiqProjectData | { id: string; value: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
