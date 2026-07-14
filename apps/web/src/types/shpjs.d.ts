declare module "shpjs" {
  import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

  export default function shp(
    input: ArrayBuffer
  ): Promise<
    | FeatureCollection<Geometry, GeoJsonProperties>
    | Array<FeatureCollection<Geometry, GeoJsonProperties> & { fileName?: string }>
  >;
}
