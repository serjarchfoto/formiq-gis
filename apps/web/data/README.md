# FORMIQ local datasets

This folder is for local datasets used by the Next.js data proxy.

Supported now:
- GeoJSON FeatureCollection
- JSON array of GeoJSON Feature objects
- single GeoJSON Feature

Planned, not parsed yet:
- NDJSON
- Parquet
- PMTiles
- ZIP archives

Default file names:
- `microsoft-buildings/buildings.geojson`
- `microsoft-buildings/dataset-links.csv`
- `overture/buildings.geojson`
- `local-buildings/buildings.geojson`
- any `*.geojson` or `*.json` file inside `city-geojson/`

The `city-geojson` directory may contain multiple files, for example:
- `buildings.geojson`
- `roads.geojson`
- `green.geojson`
- `water.geojson`
- `boundaries.geojson`
- `poi.geojson`
- `transit-stops.geojson`

Features are classified by standard properties such as `building`, `highway`,
`landuse`, `natural`, `boundary`, `public_transport`, `railway`, `category`,
and by the dataset file name.

You can also point the app to files outside the repo with server-side env vars:
- `MICROSOFT_BUILDINGS_DATA_PATH`
- `MICROSOFT_BUILDINGS_INDEX_PATH`
- `MICROSOFT_BUILDINGS_MAX_FILES`
- `MICROSOFT_BUILDINGS_MAX_FEATURES`
- `MICROSOFT_BUILDINGS_MAX_PARTITION_BYTES`
- `MICROSOFT_BUILDINGS_TIMEOUT_MS`
- `MICROSOFT_BUILDINGS_CACHE_PATH`
- `OVERTURE_DATA_PATH`
- `LOCAL_BUILDINGS_DATA_PATH`
- `CITY_GEOJSON_DATA_PATH`

Remote server-side sources:
- `OPEN_TOPOGRAPHY_API_KEY` - required for DEM requests
- `OPEN_TOPOGRAPHY_DEM_TYPE` - defaults to `COP30`
- `OPEN_TOPOGRAPHY_MAX_SAMPLES` - maximum GeoJSON terrain samples, defaults to `4096`
- `OPEN_TOPOGRAPHY_CACHE_PATH` - optional disk cache path for DEM responses
- `OPEN_TOPOGRAPHY_CACHE_DISABLED` - set to `1` to disable DEM disk cache
- `OPEN_TOPOGRAPHY_SPLIT_LARGE_REQUESTS` - set to `1` to split large bboxes into four API calls

OpenTopography keys are server-only and must never use a `NEXT_PUBLIC_` prefix.

Do not commit large datasets to GitHub. The repository `.gitignore` excludes
GeoJSON, JSON, NDJSON, Parquet, PMTiles, and ZIP files under `apps/web/data/`.
Keep only this README and small documentation files in Git.
