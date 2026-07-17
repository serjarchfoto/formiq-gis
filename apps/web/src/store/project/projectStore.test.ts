import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProjectId: null,
      projects: [],
      isHydrated: false,
      isSaving: false,
      isDirty: false,
      lastSavedAt: null,
    });
  });

  it("creates a new project with generated id, timestamps and empty collections", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "Test project",
      description: "Site analysis",
      city: "Moscow",
      author: "Architect",
      crs: "WGS84",
      units: "m",
    });

    expect(project.id).toBeTruthy();
    expect(project.id).not.toBe("local-project");
    expect(project.name).toBe("Test project");
    expect(project.description).toBe("Site analysis");
    expect(project.city).toBe("Moscow");
    expect(project.author).toBe("Architect");
    expect(project.tags).toEqual([]);
    expect(project.isArchived).toBe(false);
    expect(project.isPinned).toBe(false);
    expect(project.isFavorite).toBe(false);
    expect(project.lastOpenedAt).toBeNull();
    expect(project.crs).toBe("WGS84");
    expect(project.units).toBe("m");
    expect(Date.parse(project.metadata.createdAt)).not.toBeNaN();
    expect(Date.parse(project.metadata.updatedAt)).not.toBeNaN();
    expect(project.territories).toEqual([]);
    expect(project.layers).toEqual([]);
    expect(project.buildings).toEqual([]);
    expect(project.roads).toEqual([]);
    expect(project.vegetation).toEqual([]);
    expect(project.water).toEqual([]);
    expect(project.terrain).toEqual([]);
    expect(project.importSettings.includeTerrain).toBe(false);
    expect(project.importSettings.sources["copernicus-dem"]).toBe(false);
    expect(useProjectStore.getState().activeProjectId).toBe(project.id);
    expect(useProjectStore.getState().getProjects()).toHaveLength(1);
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it("autosaves only after a real project mutation", async () => {
    await useProjectStore.getState().createProject({ name: "Dirty state" });
    await Promise.resolve();

    expect(useProjectStore.getState().isDirty).toBe(false);

    useProjectStore.getState().updateProject((project) => ({
      ...project,
      description: "Changed",
    }));

    expect(useProjectStore.getState().isDirty).toBe(true);
    await useProjectStore.getState().saveProject();
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it("loads terrain only after the user explicitly enables it", async () => {
    await useProjectStore.getState().createProject({ name: "Terrain on demand" });

    useProjectStore.getState().setImportSourceEnabled("copernicus-dem", true);

    expect(useProjectStore.getState().project.importSettings.includeTerrain).toBe(true);
    expect(useProjectStore.getState().project.importSettings.sources["copernicus-dem"]).toBe(true);
  });

  it("updates a project name and modified date", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "Old name",
      city: "Moscow",
    });

    useProjectStore.setState({
      projects: [
        {
          ...project,
          metadata: {
            ...project.metadata,
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
        },
      ],
    });

    const updatedProject = await useProjectStore
      .getState()
      .updateProject(project.id, { name: "New name" });

    expect(updatedProject?.name).toBe("New name");
    expect(updatedProject?.metadata.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(useProjectStore.getState().getProjects()[0]?.name).toBe("New name");
  });

  it("duplicates a project with a new id and copy suffix", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "Original",
      city: "Moscow",
    });

    const copy = await useProjectStore.getState().duplicateProject(project.id);

    expect(copy?.id).toBeTruthy();
    expect(copy?.id).not.toBe(project.id);
    expect(copy?.name).toBe("Original (копия)");
    expect(useProjectStore.getState().getProjects()).toHaveLength(2);
  });

  it("updates project management flags", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "Pinned",
      city: "Moscow",
    });

    await useProjectStore.getState().setProjectPinned(project.id, true);
    await useProjectStore.getState().setProjectFavorite(project.id, true);
    await useProjectStore.getState().setProjectArchived(project.id, true);

    const updatedProject = useProjectStore.getState().getById(project.id);

    expect(updatedProject?.isPinned).toBe(true);
    expect(updatedProject?.isFavorite).toBe(true);
    expect(updatedProject?.isArchived).toBe(true);
  });

  it("imports a .formiq project without overwriting an existing id", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "Imported source",
      tags: ["city", "concept"],
    });

    const importedProject = await useProjectStore.getState().importProject({
      project,
    });

    expect(importedProject?.id).toBeTruthy();
    expect(importedProject?.id).not.toBe(project.id);
    expect(importedProject?.name).toBe("Imported source (импорт)");
    expect(importedProject?.tags).toEqual(["city", "concept"]);
    expect(useProjectStore.getState().getProjects()).toHaveLength(2);
  });

  it("deletes a project from the project list", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "To delete",
    });

    await useProjectStore.getState().deleteProject(project.id);

    expect(useProjectStore.getState().getById(project.id)).toBeNull();
    expect(useProjectStore.getState().getProjects()).toEqual([]);
  });

  it("updates the active territory in place and refreshes bounds", async () => {
    await useProjectStore.getState().createProject({
      name: "Territory update",
    });

    const initialSelection = {
      shape: "rectangle" as const,
      bounds: {
        west: 37.6,
        south: 55.7,
        east: 37.7,
        north: 55.8,
      },
      geometry: {
        type: "Feature" as const,
        properties: { source: "test" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [37.6, 55.7],
              [37.7, 55.7],
              [37.7, 55.8],
              [37.6, 55.8],
              [37.6, 55.7],
            ],
          ],
        },
      },
    };

    useProjectStore.getState().createTerritoryFromSelection(initialSelection);

    const territoryId = useProjectStore.getState().project.activeTerritoryId;
    const originalTerritory = useProjectStore.getState().project.territories[0];

    expect(territoryId).toBeTruthy();
    expect(originalTerritory?.shape).toBe("rectangle");

    const updatedSelection = {
      shape: "polygon" as const,
      bounds: {
        west: 37.61,
        south: 55.705,
        east: 37.74,
        north: 55.83,
      },
      geometry: {
        type: "Feature" as const,
        properties: { source: "test" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [37.61, 55.705],
              [37.74, 55.71],
              [37.73, 55.83],
              [37.62, 55.82],
              [37.61, 55.705],
            ],
          ],
        },
      },
    };

    useProjectStore.getState().updateTerritoryFromSelection(updatedSelection);

    const updatedTerritory = useProjectStore.getState().project.territories[0];

    expect(updatedTerritory?.id).toBe(territoryId);
    expect(updatedTerritory?.shape).toBe("polygon");
    expect(updatedTerritory?.bounds).toEqual(updatedSelection.bounds);
    expect(updatedTerritory?.geometry.geometry.coordinates).toEqual(
      updatedSelection.geometry.geometry.coordinates
    );
    expect(updatedTerritory?.loadingBuffer.bounds).toBeDefined();
    expect(useProjectStore.getState().project.metadata.bounds).toEqual(updatedSelection.bounds);
  });
});
