import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { getFeatureCollectionBbox } from "@/features/import/spatial-import/spatialImportUtils";
import type { BoundingBox } from "@/types/gis";
import type { ColumnarTable, GeoParquetAdapter, LazyColumnSource, QueryFilter, QueryResult } from "./types";

export class ColumnQueryLayer {
  query(table: ColumnarTable, filter: QueryFilter = {}): QueryResult {
    const rows: Record<string, unknown>[] = [];
    const columns = filter.columns ?? Object.keys(table.columns);

    for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
      const row = Object.fromEntries(columns.map((column) => [column, table.columns[column]?.[rowIndex]]));
      if (filter.where && !filter.where(row)) continue;
      rows.push(row);
      if (filter.limit && rows.length >= filter.limit) break;
    }

    return { rows, rowCount: rows.length };
  }
}

export class SpatialQueryService {
  intersectsBbox(collection: FeatureCollection<Geometry, GeoJsonProperties>, bbox: BoundingBox) {
    return {
      ...collection,
      features: collection.features.filter((feature) => {
        const featureBbox = getFeatureCollectionBbox({ type: "FeatureCollection", features: [feature] });
        return featureBbox ? bboxesIntersect(featureBbox, bbox) : false;
      }),
    };
  }
}

export class PlaceholderGeoParquetAdapter implements GeoParquetAdapter {
  async readMetadata(source: string): Promise<Record<string, unknown>> {
    return {
      source,
      status: "adapter-required",
      message: "GeoParquet decoding is prepared for a future DuckDB/Arrow adapter.",
    };
  }

  async createLazyTable(source: string): Promise<LazyColumnSource> {
    return {
      id: source,
      schema: {},
      async *scan() {
        yield [];
      },
    };
  }
}

export class QueryEngine {
  readonly columns = new ColumnQueryLayer();
  readonly spatial = new SpatialQueryService();

  constructor(readonly geoParquet: GeoParquetAdapter = new PlaceholderGeoParquetAdapter()) {}
}

function bboxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}
