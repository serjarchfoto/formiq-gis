import type { FormiqProjectData, TerrainSourceProvider } from "@/types/formiq";

export function getTerrainSourceProviders(project: FormiqProjectData): TerrainSourceProvider[] {
  const hasCopernicusData = project.terrain.some((terrain) => terrain.source === "copernicus-dem");
  const hasAnyTerrainData = project.terrain.length > 0;
  const openTopographyState = project.fusion?.sourceStates.find(
    (state) => state.source === "copernicus-dem"
  );
  const openTopographyConfigured = openTopographyState?.status === "ready";
  const openTopographyRateLimited = openTopographyState?.status === "rate-limited";
  const openTopographyOffline = openTopographyState?.status === "offline";
  const mapboxConfigured = Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);

  return [
    {
      id: "copernicus-dem",
      name: "OpenTopography COP30",
      description: "Copernicus DEM samples imported through the FORMIQ Data Proxy.",
      requiresApiKey: true,
      configured: hasCopernicusData || hasAnyTerrainData || openTopographyConfigured,
      status: hasCopernicusData || hasAnyTerrainData || openTopographyConfigured ? "connected" : "no-data",
      statusLabel: hasCopernicusData || hasAnyTerrainData || openTopographyConfigured ? "подключен" : "нет данных",
      resolutionMeters: 30,
      supportsMesh: false,
      supportsHeightSamples: true,
      supportsContours: false,
      supportsHillshade: false,
    },
    {
      id: "opentopography",
      name: "OpenTopography",
      description: "OpenTopography DEM profile through the FORMIQ terrain proxy.",
      requiresApiKey: true,
      configured: openTopographyConfigured,
      status: openTopographyConfigured
        ? "connected"
        : openTopographyRateLimited || openTopographyOffline
          ? "error"
          : "requires-api-key",
      statusLabel: openTopographyConfigured
        ? "подключен"
        : openTopographyRateLimited
          ? "лимит запросов"
          : openTopographyOffline
            ? "временно недоступен"
            : "требуется API key",
      supportsMesh: false,
      supportsHeightSamples: true,
      supportsContours: true,
      supportsHillshade: false,
    },
    {
      id: "mapbox-terrain-rgb",
      name: "Mapbox Terrain RGB",
      description: "Mapbox Terrain RGB raster-dem tiles.",
      requiresApiKey: true,
      configured: mapboxConfigured,
      status: mapboxConfigured ? "connected" : "not-configured",
      statusLabel: mapboxConfigured ? "подключен" : "не настроен",
      supportsMesh: false,
      supportsHeightSamples: true,
      supportsContours: false,
      supportsHillshade: true,
    },
    {
      id: "local-heightmap",
      name: "Local Heightmap",
      description: "Local raster heightmap upload placeholder.",
      requiresApiKey: false,
      configured: false,
      status: "not-configured",
      statusLabel: "загрузка файла будет позже",
      supportsMesh: false,
      supportsHeightSamples: true,
      supportsContours: false,
      supportsHillshade: true,
    },
    {
      id: "local-mesh",
      name: "Local Mesh",
      description: "Local terrain mesh upload placeholder.",
      requiresApiKey: false,
      configured: false,
      status: "not-configured",
      statusLabel: "загрузка mesh будет позже",
      supportsMesh: true,
      supportsHeightSamples: false,
      supportsContours: false,
      supportsHillshade: false,
    },
    {
      id: "none",
      name: "None",
      description: "Flat 3D base plane.",
      requiresApiKey: false,
      configured: true,
      status: "connected",
      statusLabel: "плоская модель",
      supportsMesh: false,
      supportsHeightSamples: false,
      supportsContours: false,
      supportsHillshade: false,
    },
  ];
}
