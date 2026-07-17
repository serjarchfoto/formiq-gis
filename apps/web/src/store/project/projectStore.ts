"use client";

import { create } from "zustand";
import {
  buildFormiqProjectData,
  buildFormiqProjectFromFusionResult,
  createEmptyFormiqProject,
  createFormiqProject,
  createProjectOperation,
  enrichProjectWithAnalysisCache,
  IndexedDbProjectStorage,
  layerChunkStorage,
  normalizeFormiqProject,
} from "@/lib";
import type { CreateFormiqProjectInput, DataFusionResult } from "@/lib";
import type { BoundingBox, GISLayer } from "@/types/gis";
import type {
  FormiqProjectData,
  FormiqTerritory,
  ImportSourceId,
  ProjectDisplaySettings,
  ProjectThreeDSettings,
  ProjectOperation,
  ProjectWorkspaceMode,
  TerritoryStatus,
} from "@/types/formiq";
import type { TerritorySelection } from "@/store/selection";
import { clipProjectToArea } from "@/features/selection/areaService";

export interface ProjectState {
  activeProjectId: string | null;
  project: FormiqProjectData;
  projects: FormiqProjectData[];
  isHydrated: boolean;
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
}

export type ProjectUpdatePatch = Partial<
  Pick<
    FormiqProjectData,
    | "name"
    | "description"
    | "city"
    | "author"
    | "tags"
    | "isArchived"
    | "isPinned"
    | "isFavorite"
    | "lastOpenedAt"
    | "crs"
    | "units"
  >
>;

export interface ProjectStore extends ProjectState {
  setActiveProjectId: (projectId: string | null) => void;
  hydrateProject: () => Promise<void>;
  loadAll: () => Promise<FormiqProjectData[]>;
  getProjects: () => FormiqProjectData[];
  getById: (projectId: string) => FormiqProjectData | null;
  openProject: (projectId: string) => Promise<FormiqProjectData | null>;
  saveProject: () => Promise<void>;
  setProject: (projectId: string, updatedData: FormiqProjectData) => Promise<FormiqProjectData>;
  createProject: (data: CreateFormiqProjectInput) => Promise<FormiqProjectData>;
  addProject: (data: CreateFormiqProjectInput | FormiqProjectData) => Promise<FormiqProjectData>;
  importProject: (data: unknown) => Promise<FormiqProjectData | null>;
  updateProject: (
    updaterOrId: ((project: FormiqProjectData) => FormiqProjectData) | string,
    patch?: ProjectUpdatePatch
  ) => void | Promise<FormiqProjectData | null>;
  duplicateProject: (projectId: string) => Promise<FormiqProjectData | null>;
  setProjectArchived: (projectId: string, isArchived: boolean) => Promise<FormiqProjectData | null>;
  setProjectPinned: (projectId: string, isPinned: boolean) => Promise<FormiqProjectData | null>;
  setProjectFavorite: (projectId: string, isFavorite: boolean) => Promise<FormiqProjectData | null>;
  deleteProject: (projectId: string) => Promise<void>;
  syncMapViewport: (center: [number, number], zoom: number) => void;
  syncProjectFromLayers: (layers: GISLayer[], bounds?: BoundingBox) => void;
  syncProjectFromFusion: (fusionResult: DataFusionResult) => void;
  createTerritoryFromSelection: (selection: TerritorySelection, name?: string) => void;
  updateTerritoryFromSelection: (selection: TerritorySelection, territoryId?: string) => void;
  setTerritoryStatus: (status: TerritoryStatus, territoryId?: string, revision?: FormiqTerritory["importRevision"]) => void;
  unlockAndResetTerritory: (territoryId?: string) => Promise<boolean>;
  clearActiveTerritory: () => Promise<void>;
  setActiveTerritory: (territoryId: string) => void;
  setWorkspaceMode: (mode: ProjectWorkspaceMode) => void;
  setMapDisplaySettings: (settings: Partial<ProjectDisplaySettings>) => void;
  setThreeDSettings: (settings: Partial<ProjectThreeDSettings>) => void;
  setImportSourceEnabled: (source: ImportSourceId, enabled: boolean) => void;
  recordOperation: (
    type: ProjectOperation["type"],
    label: string,
    payload?: ProjectOperation["payload"]
  ) => void;
}

const projectStorage = new IndexedDbProjectStorage();
const initialProject = createEmptyFormiqProject();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  activeProjectId: initialProject.id,
  project: initialProject,
  projects: [],
  isHydrated: false,
  isSaving: false,
  isDirty: false,
  lastSavedAt: null,

  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),

  hydrateProject: async () => {
    const storedProject = await projectStorage.loadActiveProject();

    if (!storedProject) {
      set((state) => ({
        isHydrated: true,
        activeProjectId: state.project.id,
      }));
      return;
    }

    const project = normalizeFormiqProject(storedProject);

    set({
      project,
      activeProjectId: project.id,
      projects: mergeProjects(get().projects, project),
      isHydrated: true,
      isDirty: false,
      lastSavedAt: project.metadata.updatedAt,
    });
  },

  loadAll: async () => {
    const projects = await projectStorage.loadAllProjects();
    const nextProjects = projects.length ? projects : get().projects;

    set({ projects: nextProjects });

    return nextProjects;
  },

  getProjects: () => get().projects,

  getById: (projectId) => get().projects.find((project) => project.id === projectId) ?? null,

  openProject: async (projectId) => {
    const project =
      get().projects.find((candidate) => candidate.id === projectId) ??
      (await projectStorage.loadProject(projectId));

    if (!project) {
      return null;
    }

    const openedAt = new Date().toISOString();
    const normalizedProject = normalizeFormiqProject({
      ...project,
      lastOpenedAt: openedAt,
      history: [
        createProjectOperation("project-opened", "Проект открыт", openedAt),
        ...(project.history ?? []),
      ].slice(0, 200),
    });
    const savedProject = await projectStorage.saveProject(normalizedProject);

    set({
      project: savedProject,
      activeProjectId: savedProject.id,
      projects: mergeProjects(get().projects, savedProject),
      isDirty: false,
      lastSavedAt: savedProject.metadata.updatedAt,
    });

    return savedProject;
  },

  saveProject: async () => {
    if (!get().isDirty) {
      return;
    }

    const project = normalizeFormiqProject(get().project);
    const savedAt = new Date().toISOString();
    const updatedProject = {
      ...project,
      metadata: {
        ...project.metadata,
        updatedAt: savedAt,
      },
    };

    set((state) => ({
      isSaving: true,
      project: updatedProject,
      projects: mergeProjects(state.projects, updatedProject),
    }));
    const savedProject = await projectStorage.saveProject(updatedProject);
    set((state) => {
      const isCurrentRevision =
        state.project.id === savedProject.id &&
        state.project.metadata.updatedAt === updatedProject.metadata.updatedAt;

      return {
        isSaving: false,
        isDirty: isCurrentRevision ? false : state.isDirty,
        project: isCurrentRevision ? savedProject : state.project,
        lastSavedAt: isCurrentRevision ? savedAt : state.lastSavedAt,
        projects: isCurrentRevision ? mergeProjects(state.projects, savedProject) : state.projects,
      };
    });
  },

  setProject: async (projectId, updatedData) => {
    const now = new Date().toISOString();
    const project = normalizeFormiqProject({
      ...updatedData,
      id: projectId,
      metadata: {
        ...updatedData.metadata,
        updatedAt: now,
      },
    });

    const savedProject = await projectStorage.saveProjectRecord(project);

    set((state) => ({
      project: state.project.id === projectId ? savedProject : state.project,
      projects: mergeProjects(state.projects, savedProject),
      isDirty: state.project.id === projectId ? false : state.isDirty,
      lastSavedAt: state.project.id === projectId ? savedProject.metadata.updatedAt : state.lastSavedAt,
    }));

    return savedProject;
  },

  createProject: async (data) => {
    const project = createFormiqProject(data);

    set({
      project,
      activeProjectId: project.id,
      projects: mergeProjects(get().projects, project),
      isSaving: true,
      isDirty: false,
      isHydrated: true,
      lastSavedAt: null,
    });

    markPerformance("create-project-state-ready");
    void projectStorage.saveProject(project).then((savedProject) => {
      set((state) => {
        const isCurrentRevision =
          state.project.id === savedProject.id &&
          state.project.metadata.updatedAt === project.metadata.updatedAt;

        return {
          isSaving: false,
          isDirty: isCurrentRevision ? false : state.isDirty,
          project: isCurrentRevision ? savedProject : state.project,
          lastSavedAt: isCurrentRevision ? savedProject.metadata.updatedAt : state.lastSavedAt,
          projects: isCurrentRevision ? mergeProjects(state.projects, savedProject) : state.projects,
        };
      });
    }).catch(() => {
      set((state) => ({
        isSaving: false,
        isDirty: state.project.id === project.id ? true : state.isDirty,
      }));
    });

    return project;
  },

  addProject: async (data) => {
    const project = isFormiqProjectData(data)
      ? normalizeFormiqProject(data)
      : createFormiqProject(data);

    const savedProject = await projectStorage.saveProjectRecord(project);

    set((state) => ({
      projects: mergeProjects(state.projects, savedProject),
    }));

    return savedProject;
  },

  importProject: async (data) => {
    const projectLike = unwrapImportedProject(data);

    if (!projectLike) {
      return null;
    }

    const importedProject = normalizeFormiqProject(projectLike);
    const hasIdConflict = Boolean(get().getById(importedProject.id));
    const now = new Date().toISOString();
    const project = normalizeFormiqProject({
      ...importedProject,
      id: hasIdConflict ? createEntityId() : importedProject.id,
      name: hasIdConflict ? `${importedProject.name} (импорт)` : importedProject.name,
      lastOpenedAt: importedProject.lastOpenedAt ?? null,
      metadata: {
        ...importedProject.metadata,
        updatedAt: now,
      },
      history: [
        createProjectOperation("project-created", "Проект импортирован", now, {
          sourceProjectId: importedProject.id,
        }),
        ...importedProject.history,
      ].slice(0, 200),
    });

    const savedProject = await projectStorage.saveProjectRecord(project);

    set((state) => ({
      projects: mergeProjects(state.projects, savedProject),
    }));

    return savedProject;
  },

  updateProject: (
    updaterOrId: ((project: FormiqProjectData) => FormiqProjectData) | string,
    patch?: ProjectUpdatePatch
  ): void | Promise<FormiqProjectData | null> => {
    if (typeof updaterOrId === "string") {
      return updateStoredProject(get, set, updaterOrId, patch ?? {});
    }

    set((state) => {
      const nextProject = normalizeFormiqProject(updaterOrId(state.project));
      const updatedProject = {
        ...nextProject,
        metadata: {
          ...nextProject.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
      return {
        project: updatedProject,
        activeProjectId: nextProject.id,
        projects: mergeProjects(state.projects, updatedProject),
        isDirty: true,
      };
    });
  },

  duplicateProject: async (projectId) => {
    const sourceProject =
      get().getById(projectId) ?? (await projectStorage.loadProject(projectId));

    if (!sourceProject) {
      return null;
    }

    const now = new Date().toISOString();
    const project = normalizeFormiqProject({
      ...sourceProject,
      id: createEntityId(),
      name: `${sourceProject.name} (копия)`,
      metadata: {
        ...sourceProject.metadata,
        createdAt: now,
        updatedAt: now,
      },
      history: [
        createProjectOperation("project-created", "Project duplicated", now, {
          sourceProjectId: sourceProject.id,
        }),
        ...sourceProject.history,
      ].slice(0, 200),
    });

    return get().addProject(project);
  },

  setProjectArchived: (projectId, isArchived) =>
    updateStoredProject(get, set, projectId, { isArchived }),

  setProjectPinned: (projectId, isPinned) =>
    updateStoredProject(get, set, projectId, { isPinned }),

  setProjectFavorite: (projectId, isFavorite) =>
    updateStoredProject(get, set, projectId, { isFavorite }),

  deleteProject: async (projectId) => {
    await projectStorage.deleteProject(projectId);

    const projects = get().projects.filter((project) => project.id !== projectId);
    const nextProject = projects[0] ?? createEmptyFormiqProject();

    set((state) => ({
      projects,
      project: state.activeProjectId === projectId ? nextProject : state.project,
      activeProjectId: state.activeProjectId === projectId ? nextProject.id : state.activeProjectId,
      lastSavedAt: state.activeProjectId === projectId ? nextProject.metadata.updatedAt : state.lastSavedAt,
      isDirty: state.activeProjectId === projectId ? false : state.isDirty,
    }));
  },

  syncMapViewport: (center, zoom) =>
    set((state) => ({
      project: {
        ...state.project,
        settings: {
          ...state.project.settings,
          display: {
            ...state.project.settings.display,
            mapCenter: center,
            mapZoom: zoom,
          },
        },
        metadata: {
          ...state.project.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      isDirty: true,
    })),

  syncProjectFromLayers: (layers, bounds) =>
    set((state) => {
      const project = buildFormiqProjectData(layers, state.project, bounds);

      return {
        project: appendOperation(
          project,
          "data-imported",
          "Данные импортированы в проект",
          {
            layers: layers.filter((layer) => layer.data).length,
          }
        ),
        activeProjectId: project.id,
        isDirty: true,
      };
    }),

  syncProjectFromFusion: (fusionResult) =>
    set((state) => {
      const activeTerritory = state.project.territories.find((territory) => territory.id === state.project.activeTerritoryId);
      const area = activeTerritory
        ? { shape: activeTerritory.shape ?? "polygon", bounds: activeTerritory.bounds, geometry: activeTerritory.geometry }
        : null;
      const project = clipProjectToArea(buildFormiqProjectFromFusionResult(fusionResult, state.project), area);
      const hasActiveTerritory = project.territories.some(
        (territory) => territory.id === project.activeTerritoryId
      );
      const projectWithViewport = hasActiveTerritory
        ? project
        : {
            ...project,
            settings: {
              ...project.settings,
              display: {
                ...project.settings.display,
                mapCenter: getBoundsCenter(fusionResult.bounds),
                mapZoom: estimateZoomForBounds(fusionResult.bounds),
              },
            },
          };

      return {
        project: appendOperation(projectWithViewport, "data-imported", "Данные объединены в проект", {
          fusedFeatures: fusionResult.statistics.fusedFeatureCount,
        }),
        activeProjectId: project.id,
        isDirty: true,
      };
    }),

  createTerritoryFromSelection: (selection, name) =>
    get().updateProject((project) => {
      const activeTerritory = project.territories.find((territory) => territory.id === project.activeTerritoryId);
      if (activeTerritory?.locked || activeTerritory?.status === "importing") {
        return project;
      }
      const now = new Date().toISOString();
      const territory: FormiqTerritory = {
        id: createEntityId(),
        name: name ?? `Территория ${project.territories.length + 1}`,
        type: "working-area",
        geometry: selection.geometry,
        shape: selection.shape,
        bounds: selection.bounds,
        loadingBuffer: {
          distanceMeters: project.settings.analysis.defaultBufferMeters,
          bounds: expandBounds(selection.bounds, project.settings.analysis.defaultBufferMeters),
        },
        analysisSettings: {
          includeBufferInImport: true,
          calculateOnlyInsideWorkingArea: true,
        },
        thematicMapIds: [],
        analysisResultIds: [],
        createdAt: now,
        updatedAt: now,
        isActive: true,
        status: "ready",
        locked: false,
      };

      const nextProject: FormiqProjectData = {
        ...project,
        territories: [
          ...project.territories.map((item) => ({ ...item, isActive: false })),
          territory,
        ],
        activeTerritoryId: territory.id,
        settings: {
          ...project.settings,
          display: {
            ...project.settings.display,
            mapCenter: getBoundsCenter(selection.bounds),
            mapZoom: estimateZoomForBounds(selection.bounds),
          },
        },
        metadata: {
          ...project.metadata,
          bounds: selection.bounds,
        },
      };

      return appendOperation(enrichProjectWithAnalysisCache(nextProject), "territory-created", "Территория создана", {
        territoryId: territory.id,
      });
    }),

  updateTerritoryFromSelection: (selection, territoryId) =>
    get().updateProject((project) => {
      const targetTerritoryId = territoryId ?? project.activeTerritoryId;

      if (!targetTerritoryId) {
        return project;
      }

      const existingTerritory = project.territories.find((territory) => territory.id === targetTerritoryId);

      if (!existingTerritory || existingTerritory.locked || existingTerritory.status === "importing" || existingTerritory.status === "imported") {
        return project;
      }

      const nextProject: FormiqProjectData = {
        ...project,
        territories: project.territories.map((territory) =>
          territory.id === targetTerritoryId
            ? {
                ...territory,
                geometry: selection.geometry,
                shape: selection.shape,
                bounds: selection.bounds,
                loadingBuffer: {
                  ...territory.loadingBuffer,
                  bounds: expandBounds(selection.bounds, territory.loadingBuffer.distanceMeters),
                },
                updatedAt: new Date().toISOString(),
                status: "editing",
                locked: false,
              }
            : territory
        ),
        metadata: {
          ...project.metadata,
          bounds: selection.bounds,
        },
      };

      return appendOperation(
        enrichProjectWithAnalysisCache(nextProject),
        "territory-updated",
        "РўРµСЂСЂРёС‚РѕСЂРёСЏ РѕР±РЅРѕРІР»РµРЅР°",
        {
          territoryId: existingTerritory.id,
          shape: selection.shape,
        }
      );
    }),

  setTerritoryStatus: (status, territoryId, revision) =>
    get().updateProject((project) => {
      const targetTerritoryId = territoryId ?? project.activeTerritoryId;
      if (!targetTerritoryId) return project;
      const now = new Date().toISOString();
      return {
        ...project,
        territories: project.territories.map((territory) =>
          territory.id === targetTerritoryId
            ? {
                ...territory,
                status,
                locked: status === "importing" || status === "imported",
                importRevision: revision ?? territory.importRevision,
                updatedAt: now,
              }
            : territory
        ),
      };
    }),

  unlockAndResetTerritory: async (territoryId) => {
    const targetTerritoryId = territoryId ?? get().project.activeTerritoryId;
    if (!targetTerritoryId) return false;
    const territory = get().project.territories.find((item) => item.id === targetTerritoryId);
    if (!territory) return false;
    if (typeof window !== "undefined" && !window.confirm("Разблокировать территорию? Импортированные данные и связанные результаты будут удалены.")) {
      return false;
    }
    await layerChunkStorage.deleteProjectChunks(get().project.id);
    const now = new Date().toISOString();
    get().updateProject((project) => ({
      ...project,
      territories: project.territories.map((item) =>
        item.id === targetTerritoryId
          ? {
              ...item,
              status: "editing",
              locked: false,
              importRevision: undefined,
              analysisResultIds: [],
              thematicMapIds: [],
              updatedAt: now,
            }
          : item
      ),
      analysisResults: {},
      thematicMaps: {},
      exportArtifacts: [],
    }));
    return true;
  },

  setActiveTerritory: (territoryId) =>
    get().updateProject((project) => {
      const activeBounds =
        project.territories.find((territory) => territory.id === territoryId)?.bounds ??
        project.metadata.bounds;

      const nextProject: FormiqProjectData = {
          ...project,
          activeTerritoryId: territoryId,
          territories: project.territories.map((territory) => ({
            ...territory,
            isActive: territory.id === territoryId,
          })),
          settings: {
            ...project.settings,
            display: {
              ...project.settings.display,
              mapCenter: activeBounds
                ? getBoundsCenter(activeBounds)
                : project.settings.display.mapCenter,
              mapZoom: estimateZoomForBounds(activeBounds),
            },
          },
        };

      return appendOperation(
        enrichProjectWithAnalysisCache(nextProject),
        "territory-activated",
        "Территория активирована",
        { territoryId }
      );
    }),

  clearActiveTerritory: async () => {
    await layerChunkStorage.deleteProjectChunks(get().project.id);
    get().updateProject((project) => ({
      ...project,
      territories: project.territories.filter((territory) => territory.id !== project.activeTerritoryId),
      activeTerritoryId: null,
      buildings: [], roads: [], vegetation: [], water: [], terrain: [], boundaries: [], poi: [], transitStops: [],
      layers: [], layerSystem: [], fusion: null,
      analysisResults: {}, thematicMaps: {}, exportArtifacts: [],
    }));
  },

  setWorkspaceMode: (mode) =>
    get().updateProject((project) =>
      appendOperation(
        {
          ...project,
          settings: {
            ...project.settings,
            display: {
              ...project.settings.display,
              workspaceMode: mode,
            },
          },
        },
        "workspace-mode-changed",
        "Режим рабочего пространства изменен",
        { mode }
      )
    ),

  setMapDisplaySettings: (settings) =>
    get().updateProject((project) =>
      appendOperation(
        {
          ...project,
          settings: {
            ...project.settings,
            display: {
              ...project.settings.display,
              ...settings,
            },
          },
        },
        "project-settings-updated",
        "Параметры отображения карты обновлены",
        {
          cartographicTheme: settings.cartographicTheme ?? null,
        }
      )
    ),

  setThreeDSettings: (settings) =>
    get().updateProject((project) =>
      appendOperation(
        {
          ...project,
          settings: {
            ...project.settings,
            threeD: {
              ...project.settings.threeD,
              ...settings,
              terrain: {
                ...project.settings.threeD.terrain,
                ...settings.terrain,
              },
            },
          },
        },
        "project-settings-updated",
        "3D map settings updated",
        {
          threeDMapType: settings.activeMapType ?? null,
        }
      )
    ),

  setImportSourceEnabled: (source, enabled) =>
    get().updateProject((project) => ({
      ...project,
      importSettings: {
        ...project.importSettings,
        includeTerrain:
          source === "copernicus-dem" ? enabled : project.importSettings.includeTerrain,
        sources: {
          ...project.importSettings.sources,
          [source]: enabled,
        },
      },
    })),

  recordOperation: (type, label, payload) =>
    get().updateProject((project) => appendOperation(project, type, label, payload)),
}));

type ProjectStoreSetter = (partial: Partial<ProjectStore> | ((state: ProjectStore) => Partial<ProjectStore>)) => void;

async function updateStoredProject(
  get: () => ProjectStore,
  set: ProjectStoreSetter,
  projectId: string,
  patch: ProjectUpdatePatch
): Promise<FormiqProjectData | null> {
  const currentProjects = get().projects;
  const storedProjects = currentProjects.length ? currentProjects : await projectStorage.loadAllProjects();
  const project = storedProjects.find((candidate) => candidate.id === projectId);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedProject = normalizeFormiqProject({
    ...project,
    ...patch,
    metadata: {
      ...project.metadata,
      updatedAt: now,
    },
    settings: {
      ...project.settings,
      export: {
        ...project.settings.export,
        author: patch.author ?? project.settings.export.author,
      },
    },
  });

  const savedProject = await projectStorage.saveProjectRecord(updatedProject);

  set((state) => ({
    project: state.project.id === projectId ? savedProject : state.project,
    activeProjectId: state.activeProjectId,
    projects: mergeProjects(state.projects, savedProject),
    isDirty: state.project.id === projectId ? false : state.isDirty,
    lastSavedAt: state.project.id === projectId ? savedProject.metadata.updatedAt : state.lastSavedAt,
  }));

  return savedProject;
}

function markPerformance(name: string): void {
  if (typeof performance === "undefined") return;
  performance.clearMarks(name);
  performance.mark(name);
}

function mergeProjects(projects: FormiqProjectData[], project: FormiqProjectData): FormiqProjectData[] {
  const nextProjects = new Map(projects.map((item) => [item.id, item]));
  nextProjects.set(project.id, project);

  return Array.from(nextProjects.values()).sort((left, right) =>
    right.metadata.updatedAt.localeCompare(left.metadata.updatedAt)
  );
}

function isFormiqProjectData(data: CreateFormiqProjectInput | FormiqProjectData): data is FormiqProjectData {
  return "id" in data && "metadata" in data && "layers" in data && "territories" in data;
}

function unwrapImportedProject(data: unknown): Partial<FormiqProjectData> | null {
  if (!isRecord(data)) {
    return null;
  }

  const candidate = isRecord(data.project) ? data.project : data;

  if (typeof candidate.name !== "string") {
    return null;
  }

  return candidate as Partial<FormiqProjectData>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function appendOperation(
  project: FormiqProjectData,
  type: ProjectOperation["type"],
  label: string,
  payload?: ProjectOperation["payload"]
): FormiqProjectData {
  return {
    ...project,
    history: [
      createProjectOperation(type, label, new Date().toISOString(), payload),
      ...project.history,
    ].slice(0, 200),
  };
}

function expandBounds(bounds: BoundingBox, distanceMeters: number): BoundingBox {
  const latitudeDelta = distanceMeters / 111_320;
  const centerLatitude = (bounds.north + bounds.south) / 2;
  const longitudeDelta = distanceMeters / (111_320 * Math.cos((centerLatitude * Math.PI) / 180));

  return {
    west: bounds.west - longitudeDelta,
    south: bounds.south - latitudeDelta,
    east: bounds.east + longitudeDelta,
    north: bounds.north + latitudeDelta,
  };
}

function getBoundsCenter(bounds: BoundingBox): [number, number] {
  return [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ];
}

function estimateZoomForBounds(bounds?: BoundingBox): number {
  if (!bounds) {
    return 11;
  }

  const longitudeSpan = Math.max(bounds.east - bounds.west, 0.0001);
  const latitudeSpan = Math.max(bounds.north - bounds.south, 0.0001);
  const dominantSpan = Math.max(longitudeSpan, latitudeSpan);
  const zoom = 9 - Math.log2(dominantSpan);

  return Math.max(9, Math.min(17, Number(zoom.toFixed(2))));
}

function createEntityId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `formiq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
