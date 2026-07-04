import { expect, type Page, test } from "@playwright/test";

test("creates a project from the start page and opens the map", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /FORMIQ/ })).toBeVisible();

  await page.getByTestId("create-project-button").click();
  await expect(page.getByTestId("create-project-dialog")).toBeVisible();

  await page.getByTestId("create-project-name").fill("E2E project");
  await page.getByTestId("create-project-description").fill("Created by Playwright");
  await page.getByTestId("create-project-city").fill("Moscow");
  await page.getByTestId("create-project-author").fill("QA");
  await page.getByTestId("create-project-submit").click();

  await expect(page).toHaveURL(/\/map\?projectId=.+/);
});

test("shows existing projects and opens the selected project", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-1", "Project One", "Moscow", "2026-07-01T10:00:00.000Z"),
    projectRecord("project-2", "Project Two", "Kazan", "2026-07-02T10:00:00.000Z"),
  ]);

  await page.goto("/");

  await expect(page.getByText("Project One")).toBeVisible();
  await expect(page.getByText("Project Two")).toBeVisible();

  await page.getByTestId("open-project-project-1").click();
  await expect(page).toHaveURL(/\/map\?projectId=project-1$/);
});

test("renames a project and keeps the new name after reload", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-rename", "Before rename", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/");

  await page.getByTestId("rename-project-project-rename").click();
  await page.getByTestId("rename-project-name").fill("After rename");
  await page.getByTestId("rename-project-submit").click();

  await expect(page.getByText("After rename")).toBeVisible();

  await page.reload();

  await expect(page.getByText("After rename")).toBeVisible();
});

test("deletes a project and keeps it removed after reload", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-delete", "Delete me", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/");

  await expect(page.getByText("Delete me")).toBeVisible();
  await page.getByTestId("delete-project-project-delete").click();
  await expect(page.getByTestId("delete-project-dialog")).toBeVisible();
  await page.getByTestId("delete-project-confirm").click();

  await expect(page.getByTestId("delete-project-dialog")).not.toBeVisible();
  await expect(page.getByTestId("project-card-project-delete")).not.toBeVisible();

  await page.reload();

  await expect(page.getByTestId("project-card-project-delete")).not.toBeVisible();
});

test("duplicates a project and shows a copy card", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-duplicate", "Original", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/");

  await page.getByTestId("duplicate-project-project-duplicate").click();

  await expect(page.getByText("Original")).toBeVisible();
  await expect(page.getByText("Original (\u043a\u043e\u043f\u0438\u044f)")).toBeVisible();
});

test("autosaves project changes on the map and restores them after reload", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-autosave", "Autosave project", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/map?projectId=project-autosave");
  await page.getByTestId("workspace-mode-analysis").click();
  await page.waitForTimeout(900);
  await page.reload();

  const workspaceMode = await readProjectField<string>(
    page,
    "project-autosave",
    "settings.display.workspaceMode"
  );

  expect(workspaceMode).toBe("analysis");
});

test("toggles data sources and shows a no-bounds message for single-entry import", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-source-settings", "Source settings project", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/map?projectId=project-source-settings");

  await page.getByTestId("data-sources-button").click();
  await page.getByTestId("source-toggle-wikidata").uncheck();
  await page.waitForTimeout(900);

  const wikidataEnabled = await readProjectField<boolean>(
    page,
    "project-source-settings",
    "importSettings.sources.wikidata"
  );
  expect(wikidataEnabled).toBe(false);

  await page.getByTestId("single-import-button").click();
  await expect(page.getByTestId("import-progress-popover")).toBeVisible();
  await expect(page.getByTestId("import-progress-popover").getByText(/территория|выделение/i)).toBeVisible();
});

test("imports a GeoJSON layer, applies visibility and opacity, and restores it after reload", async ({ page }) => {
  await seedProjects(page, [
    projectRecord("project-layer-system", "Layer system project", "Moscow", "2026-07-01T10:00:00.000Z"),
  ]);

  await page.goto("/map?projectId=project-layer-system");
  await page.waitForFunction(() => Boolean((window as unknown as { __formiqMap?: unknown }).__formiqMap));

  await page.getByTestId("add-layer-button").click();
  await page.getByTestId("layer-file-input").setInputFiles({
    name: "sample.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "sample" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [37.61, 55.75],
                  [37.62, 55.75],
                  [37.62, 55.76],
                  [37.61, 55.76],
                  [37.61, 55.75],
                ],
              ],
            },
          },
        ],
      })
    ),
  });
  await page.getByTestId("layer-import-submit").click();

  const layerId = await waitForProjectLayerId(page, "project-layer-system", "sample");
  await expect(page.getByTestId(`layer-row-${layerId}`)).toBeVisible();
  await expect.poll(() => getMapLayerLayoutProperty(page, layerId, "visibility")).toBe("visible");

  await page.getByTestId(`layer-visible-${layerId}`).uncheck();
  await expect.poll(() => getMapLayerLayoutProperty(page, layerId, "visibility")).toBe("none");

  await page.getByTestId(`layer-opacity-${layerId}`).fill("0.35");
  await expect.poll(() => getMapLayerPaintProperty<number>(page, layerId, "fill-opacity")).toBe(0.35);

  await page.waitForTimeout(900);
  await page.reload();

  await expect(page.getByTestId(`layer-row-${layerId}`)).toBeVisible();
  await expect(page.getByTestId(`layer-visible-${layerId}`)).not.toBeChecked();

  const storedLayers = await readProjectField<Array<{ id: string; opacity: number; visible: boolean; order: number }>>(
    page,
    "project-layer-system",
    "layerSystem"
  );
  const storedLayer = storedLayers.find((layer) => layer.id === layerId);

  expect(storedLayer?.opacity).toBe(0.35);
  expect(storedLayer?.visible).toBe(false);
  expect(storedLayers.map((layer) => layer.order)).toEqual(storedLayers.map((_, index) => index));
});

function projectRecord(id: string, name: string, city: string, updatedAt: string) {
  return {
    id,
    name,
    description: "",
    city,
    author: "QA",
    crs: "WGS84",
    units: "m",
    metadata: {
      createdAt: updatedAt,
      updatedAt,
    },
    territories: [],
    layers: [],
  };
}

async function seedProjects(page: Page, projects: unknown[]) {
  await page.goto("/");
  await page.evaluate(async (records) => {
    const deleteRequest = indexedDB.deleteDatabase("formiq-workspace");
    await new Promise<void>((resolve, reject) => {
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onblocked = () => resolve();
    });

    const openRequest = indexedDB.open("formiq-workspace", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains("projects")) {
          database.createObjectStore("projects", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("metadata")) {
          database.createObjectStore("metadata", { keyPath: "id" });
        }
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["projects", "metadata"], "readwrite");
      const projectStore = transaction.objectStore("projects");
      for (const record of records) {
        projectStore.put(record);
      }
      transaction.objectStore("metadata").put({
        id: "active-project-id",
        value: (records[0] as { id: string }).id,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    database.close();
  }, projects);
}

async function readProjectField<T>(page: Page, projectId: string, path: string): Promise<T> {
  return page.evaluate(
    async ({ id, fieldPath }) => {
      const openRequest = indexedDB.open("formiq-workspace", 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      const project = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const transaction = database.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();

      return fieldPath
        .split(".")
        .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], project);
    },
    { id: projectId, fieldPath: path }
  ) as Promise<T>;
}

async function waitForProjectLayerId(page: Page, projectId: string, layerName: string): Promise<string> {
  await expect.poll(async () => {
    const layers = await readProjectField<Array<{ id: string; name: string }>>(
      page,
      projectId,
      "layerSystem"
    );
    return (layers ?? []).find((layer) => layer.name === layerName)?.id ?? "";
  }).not.toBe("");

  const layers = await readProjectField<Array<{ id: string; name: string }>>(
    page,
    projectId,
    "layerSystem"
  );

  return (layers ?? []).find((layer) => layer.name === layerName)?.id ?? "";
}

async function getMapLayerLayoutProperty(
  page: Page,
  layerId: string,
  property: string
): Promise<unknown> {
  return page.evaluate(
    ({ id, propertyName }) => {
      const map = (window as unknown as {
        __formiqMap?: {
          getLayer: (layerId: string) => unknown;
          getLayoutProperty: (layerId: string, property: string) => unknown;
        };
      }).__formiqMap;
      const mapLayerId = `formiq-${id}-fill`;

      if (!map?.getLayer(mapLayerId)) {
        return null;
      }

      return map.getLayoutProperty(mapLayerId, propertyName);
    },
    { id: layerId, propertyName: property }
  );
}

async function getMapLayerPaintProperty<T>(
  page: Page,
  layerId: string,
  property: string
): Promise<T | null> {
  return page.evaluate(
    ({ id, propertyName }) => {
      const map = (window as unknown as {
        __formiqMap?: {
          getLayer: (layerId: string) => unknown;
          getPaintProperty: (layerId: string, property: string) => unknown;
        };
      }).__formiqMap;
      const mapLayerId = `formiq-${id}-fill`;

      if (!map?.getLayer(mapLayerId)) {
        return null;
      }

      return map.getPaintProperty(mapLayerId, propertyName);
    },
    { id: layerId, propertyName: property }
  ) as Promise<T | null>;
}
