import type { Layer, LayerSystemState } from "./types";

export class LayerSystem {
  createState(layers: Layer[] = []): LayerSystemState {
    return {
      layers: this.normalizeOrder(layers),
    };
  }

  addLayer(state: LayerSystemState, layer: Layer): LayerSystemState {
    return {
      layers: this.normalizeOrder([...state.layers, layer]),
    };
  }

  removeLayer(state: LayerSystemState, layerId: string): LayerSystemState {
    return {
      layers: this.normalizeOrder(
        state.layers.filter((layer) => layer.id !== layerId || !layer.removable)
      ),
    };
  }

  moveLayer(state: LayerSystemState, layerId: string, direction: -1 | 1): LayerSystemState {
    const layers = this.normalizeOrder(state.layers);
    const index = layers.findIndex((layer) => layer.id === layerId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) {
      return state;
    }

    [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];

    return {
      layers: this.normalizeOrder(layers),
    };
  }

  private normalizeOrder(layers: Layer[]): Layer[] {
    return layers
      .map((layer, index) => ({
        ...layer,
        order: layer.order ?? index,
      }))
      .sort((left, right) => left.order - right.order)
      .map((layer, index) => ({
        ...layer,
        order: index,
      }));
  }
}
