# Microsoft Building Footprints

Place Microsoft Global ML Building Footprints data for FORMIQ here.

The application reads local building datasets from this directory through the
existing Data Proxy. Supported files are GeoJSON/JSON files such as:

- `buildings.geojson`
- `buildings.json`
- any additional `*.geojson` or `*.json` files with GeoJSON features
- `dataset-links.csv` from Microsoft Global ML Building Footprints

When `buildings.geojson` is absent, FORMIQ can use `dataset-links.csv` as an
index. The Microsoft proxy computes quadkeys for the selected bbox, downloads
only matching `.csv.gz` GeoJSONL partitions, filters features by bbox, and
returns them to the existing Data Fusion pipeline.

Use these server-side environment variables when needed:

- `MICROSOFT_BUILDINGS_INDEX_PATH`
- `MICROSOFT_BUILDINGS_MAX_FILES`
- `MICROSOFT_BUILDINGS_MAX_FEATURES`
- `MICROSOFT_BUILDINGS_MAX_PARTITION_BYTES`
- `MICROSOFT_BUILDINGS_TIMEOUT_MS`
- `MICROSOFT_BUILDINGS_CACHE_PATH`

Do not commit large downloaded footprint datasets to Git. Keep generated local
files ignored and use server-side data paths when needed.
