import type { DataSourceKind } from "@/types/formiq";
import type { IDataSource } from "./types";

export class SourceRegistry {
  private readonly sources = new Map<DataSourceKind, IDataSource>();

  register(source: IDataSource): this {
    this.sources.set(source.id, source);
    return this;
  }

  unregister(source: DataSourceKind): this {
    this.sources.delete(source);
    return this;
  }

  get(source: DataSourceKind): IDataSource | undefined {
    return this.sources.get(source);
  }

  require(source: DataSourceKind): IDataSource {
    const dataSource = this.get(source);

    if (!dataSource) {
      throw new Error(`Data source "${source}" is not registered.`);
    }

    return dataSource;
  }

  has(source: DataSourceKind): boolean {
    return this.sources.has(source);
  }

  list(): IDataSource[] {
    return Array.from(this.sources.values());
  }
}
