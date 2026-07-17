"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/project";
import { useLayers } from "@/store/layers";
import { useSelectionStore } from "@/store/selection";

export default function ProjectWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const project = useProjectStore((state) => state.project);
  const isHydrated = useProjectStore((state) => state.isHydrated);
  const isDirty = useProjectStore((state) => state.isDirty);
  const hydrateProject = useProjectStore((state) => state.hydrateProject);
  const openProject = useProjectStore((state) => state.openProject);
  const saveProject = useProjectStore((state) => state.saveProject);
  const hydrateLayersFromProject = useLayers((state) => state.hydrateFromProject);
  const syncSelectionFromProject = useSelectionStore((state) => state.syncSelectionFromProject);
  const didHydrateRef = useRef(false);

  useEffect(() => {
    if (didHydrateRef.current) {
      return;
    }

    didHydrateRef.current = true;
    const projectId = new URLSearchParams(window.location.search).get("projectId");

    if (projectId) {
      void openProject(projectId).then((project) => {
        if (project) {
          useProjectStore.setState({ isHydrated: true });
          return;
        }

        void hydrateProject();
      });
      return;
    }

    void hydrateProject();
  }, [hydrateProject, openProject]);

  useEffect(() => {
    hydrateLayersFromProject(project.layerSystem);
  }, [hydrateLayersFromProject, project.id, project.layerSystem]);

  useEffect(() => {
    const activeTerritory =
      project.territories.find((territory) => territory.id === project.activeTerritoryId) ?? null;

    syncSelectionFromProject(activeTerritory);
  }, [project.activeTerritoryId, project.territories, syncSelectionFromProject]);

  useEffect(() => {
    if (!isHydrated || !isDirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveProject();
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [isDirty, isHydrated, project, saveProject]);

  return children;
}
