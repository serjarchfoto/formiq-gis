import type { IThematicLayer } from "./types";

export class ThemeRegistry {
  private readonly layers = new Map<string, IThematicLayer>();

  register(layer: IThematicLayer): this {
    this.layers.set(layer.id, layer);

    return this;
  }

  get(id: string): IThematicLayer | null {
    return this.layers.get(id) ?? null;
  }

  getAll(): IThematicLayer[] {
    return Array.from(this.layers.values());
  }

  getOptions(): Array<{ id: string; title: string }> {
    return this.getAll().map((layer) => ({
      id: layer.id,
      title: layer.title,
    }));
  }
}
