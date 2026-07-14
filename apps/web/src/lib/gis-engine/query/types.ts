import type { BoundingBox } from "@/types/gis";

export interface ColumnarTable {
  id: string;
  columns: Record<string, unknown[]>;
  rowCount: number;
}

export interface QueryFilter {
  bbox?: BoundingBox;
  where?: (row: Record<string, unknown>) => boolean;
  limit?: number;
  columns?: string[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface StreamingReader<T> {
  read(options?: { batchSize?: number }): AsyncIterable<T[]>;
}

export interface GeoParquetAdapter {
  readMetadata(source: string): Promise<Record<string, unknown>>;
  createLazyTable(source: string): Promise<LazyColumnSource>;
}

export interface LazyColumnSource {
  id: string;
  schema: Record<string, string>;
  scan(filter?: QueryFilter): AsyncIterable<Record<string, unknown>[]>;
}
