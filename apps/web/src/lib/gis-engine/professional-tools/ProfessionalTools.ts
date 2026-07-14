import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";
import { MeasurementService } from "@/lib/gis-engine/operations";

export class MeasurementTool {
  private readonly measurement = new MeasurementService();
  distance(start: Position, end: Position): number {
    return this.measurement.distance(start, end).value;
  }
}

export class SnappingTool {
  snap(point: Position, candidates: Position[], toleranceMeters: number): Position {
    const measurement = new MeasurementService();
    const nearest = candidates
      .map((candidate) => ({ candidate, distance: measurement.distance(point, candidate).value }))
      .sort((a, b) => a.distance - b.distance)[0];

    return nearest && nearest.distance <= toleranceMeters ? nearest.candidate : point;
  }
}

export class EditingTool {
  updateFeatureGeometry<TGeometry extends Geometry>(feature: Feature<TGeometry>, geometry: TGeometry): Feature<TGeometry> {
    return { ...feature, geometry };
  }
}

export class SelectionTool {
  selectByPredicate<TGeometry extends Geometry>(
    collection: FeatureCollection<TGeometry, GeoJsonProperties>,
    predicate: (feature: Feature<TGeometry, GeoJsonProperties>) => boolean
  ) {
    return { ...collection, features: collection.features.filter(predicate) };
  }
}

export class LayerManagementTool {
  reorder<T extends { id: string; order: number }>(layers: T[], layerId: string, order: number): T[] {
    return layers
      .map((layer) => (layer.id === layerId ? { ...layer, order } : layer))
      .sort((a, b) => a.order - b.order)
      .map((layer, index) => ({ ...layer, order: index }));
  }
}

export class AttributeTableTool {
  rows(collection: FeatureCollection<Geometry, GeoJsonProperties>) {
    return collection.features.map((feature, index) => ({
      id: feature.id ?? index,
      ...(feature.properties ?? {}),
    }));
  }
}

export class SpatialSearchTool {
  searchByText(collection: FeatureCollection<Geometry, GeoJsonProperties>, text: string) {
    const needle = text.toLowerCase();
    return {
      ...collection,
      features: collection.features.filter((feature) =>
        JSON.stringify(feature.properties ?? {}).toLowerCase().includes(needle)
      ),
    };
  }
}

export class BookmarkTool {
  create(id: string, name: string, center: Position, zoom: number) {
    return { id, name, center, zoom };
  }
}

export class LayoutTool {
  createLayout(id: string, title: string, pageSize: "a4" | "a3" = "a4") {
    return { id, title, pageSize, elements: [] as string[] };
  }
}

export class PrintTool {
  createPrintSpec(layoutId: string, dpi = 300) {
    return { layoutId, dpi, format: "pdf" as const };
  }
}

export class TopologyTool {
  findDuplicateCoordinates(coordinates: Position[]): Position[] {
    const seen = new Set<string>();
    const duplicates: Position[] = [];

    coordinates.forEach((coordinate) => {
      const key = `${coordinate[0]}:${coordinate[1]}`;
      if (seen.has(key)) duplicates.push(coordinate);
      seen.add(key);
    });

    return duplicates;
  }
}
