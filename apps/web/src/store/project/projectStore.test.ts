import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProjectId: null,
      projects: [],
      isHydrated: false,
      isSaving: false,
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
    expect(useProjectStore.getState().activeProjectId).toBe(project.id);
    expect(useProjectStore.getState().getProjects()).toHaveLength(1);
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

  it("deletes a project from the project list", async () => {
    const project = await useProjectStore.getState().createProject({
      name: "To delete",
    });

    await useProjectStore.getState().deleteProject(project.id);

    expect(useProjectStore.getState().getById(project.id)).toBeNull();
    expect(useProjectStore.getState().getProjects()).toEqual([]);
  });
});
