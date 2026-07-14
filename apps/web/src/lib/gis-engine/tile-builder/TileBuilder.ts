import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { SimplifyService } from "@/lib/gis-engine/operations";
import type { BuiltVectorTile, GeneralizationStep, TileBuilderOptions, TileCoord, TilePyramid } from "./types";

export class LODGenerator {
  getTolerance(zoom: number, maxZoom: number, baseToleranceMeters = 2): number {
    return baseToleranceMeters * 2 ** Math.max(maxZoom - zoom, 0);
  }
}

export class GeometrySimplifierStep implements GeneralizationStep {
  readonly id = "geometry-simplifier";
  private readonly simplifier = new SimplifyService();

  constructor(private readonly lod = new LODGenerator(), private readonly maxZoom = 14, private readonly baseToleranceMeters = 2) {}

  apply(collection: FeatureCollection<Geometry, GeoJsonProperties>, zoom: number) {
    const toleranceMeters = this.lod.getTolerance(zoom, this.maxZoom, this.baseToleranceMeters);

    return {
      ...collection,
      features: collection.features.map((feature) =>
        this.simplifier.simplify(feature, { toleranceMeters }).value
      ),
    };
  }
}

export class GeneralizationPipeline {
  constructor(private readonly steps: GeneralizationStep[] = []) {}

  apply(collection: FeatureCollection<Geometry, GeoJsonProperties>, zoom: number) {
    return this.steps.reduce((current, step) => step.apply(current, zoom), collection);
  }
}

export class TileBuilder {
  constructor(private readonly lod = new LODGenerator()) {}

  build(collection: FeatureCollection<Geometry, GeoJsonProperties>, options: TileBuilderOptions): TilePyramid {
    const pipeline = new GeneralizationPipeline([
      new GeometrySimplifierStep(this.lod, options.maxZoom, options.simplificationBaseToleranceMeters ?? 2),
    ]);
    const tiles: BuiltVectorTile[] = [];

    for (let z = options.minZoom; z <= options.maxZoom; z += 1) {
      const generalized = pipeline.apply(collection, z);
      const coords = getCoveringTiles(generalized, z);
      coords.forEach((coord) => {
        tiles.push({
          coord,
          layers: [{
            name: options.layerName,
            features: generalized.features.map((feature, index) => ({
              id: String(feature.id ?? `${coord.z}/${coord.x}/${coord.y}:${index}`),
              geometry: feature.geometry,
              properties: feature.properties ?? {},
            })),
          }],
        });
      });
    }

    return { minZoom: options.minZoom, maxZoom: options.maxZoom, tiles };
  }
}

function getCoveringTiles(collection: FeatureCollection<Geometry, GeoJsonProperties>, z: number): TileCoord[] {
  const coords = new Map<string, TileCoord>();

  collection.features.forEach((feature) => {
    getFlatCoordinates(feature.geometry).forEach(([lng, lat]) => {
      const coord = lngLatToTile(lng, lat, z);
      coords.set(`${coord.z}/${coord.x}/${coord.y}`, coord);
    });
  });

  return Array.from(coords.values());
}

function lngLatToTile(lng: number, lat: number, z: number): TileCoord {
  const n = 2 ** z;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lng + 180) / 360) * n)));
  const latRad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const y = Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)));

  return { z, x, y };
}

function getFlatCoordinates(geometry: Geometry): number[][] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}
