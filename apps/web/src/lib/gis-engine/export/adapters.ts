import type { Position } from "geojson";
import { BaseExporter } from "./BaseExporter";
import {
  encodeUtf8,
  entitiesToFeatureCollection,
  entityProperties,
  escapeCsv,
  escapeXml,
  formiqGeometryToGeoJson,
  getGeometryPositions,
  getProjectBounds,
} from "./exportUtils";
import type { ExportContext, ExportResult } from "./types";
import type { FormiqBuilding, FormiqEntity, FormiqPolygonGeometry } from "@/types/formiq";

export class GeoJsonExporter extends BaseExporter {
  readonly format = "geojson" as const;
  readonly label = "GeoJSON";
  readonly extension = "geojson";
  readonly mimeType = "application/geo+json";

  async export(context: ExportContext): Promise<ExportResult> {
    this.emit(context, { stage: "prepare-data", status: "loading", message: "Collecting FORMIQ entities", progress: 25 });
    const entities = this.getEntities(context);
    const collection = entitiesToFeatureCollection(context.project, entities);
    const payload = {
      ...collection,
      formiq: {
        project: {
          id: context.project.id,
          name: context.project.name,
          description: context.project.description,
          author: context.project.author,
          crs: context.options.crs ?? context.project.crs,
          units: context.options.units ?? context.project.units,
          city: context.project.city,
        },
        terrainMetadata: context.project.terrain.map((item) => entityProperties(item)),
      },
    };
    this.emit(context, { stage: "write", status: "loading", message: "Writing GeoJSON", progress: 80 });
    return this.createResult(context, encodeUtf8(JSON.stringify(payload, null, 2)), entities.length);
  }
}

export class CsvExporter extends BaseExporter {
  readonly format = "csv" as const;
  readonly label = "CSV";
  readonly extension = "csv";
  readonly mimeType = "text/csv;charset=utf-8";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const columns = context.options.columns?.length
      ? context.options.columns
      : ["id", "type", "source", "confidence", "name", "height", "levels", "area", "length", "category", "longitude", "latitude"];
    this.emit(context, { stage: "convert", status: "loading", message: "Converting entities to CSV rows", progress: 55 });
    const lines = [
      columns.map(escapeCsv).join(","),
      ...entities.map((entity) => columns.map((column) => escapeCsv(csvValue(entity, column))).join(",")),
    ];
    return this.createResult(context, encodeUtf8(`\uFEFF${lines.join("\n")}`), entities.length);
  }
}

export class KmlExporter extends BaseExporter {
  readonly format = "kml" as const;
  readonly label = "KML";
  readonly extension = "kml";
  readonly mimeType = "application/vnd.google-earth.kml+xml";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const body = entities.map(entityToKmlPlacemark).join("\n");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(context.project.name)}</name>
  <Style id="building"><PolyStyle><color>99509ED9</color></PolyStyle><LineStyle><color>FF1D8CC2</color><width>1</width></LineStyle></Style>
  <Style id="road"><LineStyle><color>FF374151</color><width>2</width></LineStyle></Style>
  <Style id="poi"><IconStyle><scale>0.8</scale></IconStyle></Style>
  ${body}
</Document>
</kml>`;
    return this.createResult(context, encodeUtf8(kml), entities.length);
  }
}

export class DxfExporter extends BaseExporter {
  readonly format = "dxf" as const;
  readonly label = "DXF";
  readonly extension = "dxf";
  readonly mimeType = "application/dxf";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const parts = ["0", "SECTION", "2", "ENTITIES"];
    entities.forEach((entity) => {
      if (entity.geometry.type === "point") {
        parts.push(...dxfPoint(entity.geometry.coordinates, entity.type));
      } else if (entity.geometry.type === "line") {
        parts.push(...dxfPolyline(entity.geometry.coordinates, entity.type, false));
      } else {
        entity.geometry.rings.forEach((ring) => parts.push(...dxfPolyline(ring, entity.type, true)));
        if (entity.type === "building" && entity.height) {
          parts.push(...dxf3dFace(entity.geometry, entity.height, entity.type));
        }
      }
    });
    parts.push("0", "ENDSEC", "0", "EOF");
    return this.createResult(context, encodeUtf8(parts.join("\n")), entities.length);
  }
}

export class ObjExporter extends BaseExporter {
  readonly format = "obj" as const;
  readonly label = "OBJ";
  readonly extension = "obj";
  readonly mimeType = "model/obj";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const lines = [`# FORMIQ OBJ export`, `o ${sanitizeObjName(context.project.name)}`];
    let vertexOffset = 1;
    entities.filter((entity): entity is FormiqBuilding => entity.type === "building").forEach((building) => {
      const mesh = buildingToObj(building, vertexOffset);
      lines.push(...mesh.lines);
      vertexOffset = mesh.nextVertexOffset;
    });
    return this.createResult(context, encodeUtf8(lines.join("\n")), entities.length);
  }
}

export class GltfExporter extends BaseExporter {
  readonly format = "gltf" as const;
  readonly label = "glTF";
  readonly extension = "gltf";
  readonly mimeType = "model/gltf+json";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const gltf = {
      asset: { version: "2.0", generator: "FORMIQ Export Engine" },
      scene: 0,
      scenes: [{ nodes: entities.map((_, index) => index) }],
      nodes: entities.map((entity, index) => ({
        name: `${entity.type}-${entity.id}`,
        mesh: index,
        extras: entityProperties(entity),
      })),
      meshes: entities.map((entity) => ({
        name: entity.id,
        primitives: [{ mode: gltfMode(entity), attributes: {}, extras: { geometry: formiqGeometryToGeoJson(entity.geometry) } }],
      })),
      materials: [{ name: "FORMIQ default", pbrMetallicRoughness: { baseColorFactor: [0.82, 0.86, 0.9, 1], roughnessFactor: 0.8 } }],
      extras: { projectId: context.project.id, projectName: context.project.name },
    };
    return this.createResult(context, encodeUtf8(JSON.stringify(gltf, null, 2)), entities.length);
  }
}

export class PngExporter extends BaseExporter {
  readonly format = "png" as const;
  readonly label = "PNG";
  readonly extension = "png";
  readonly mimeType = "image/png";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const scale = context.options.resolutionScale ?? 1;
    const width = 1200 * scale;
    const height = 800 * scale;
    const bounds = context.options.bbox ?? getProjectBounds(context.project);
    const rgba = renderPngMap(entities, bounds, width, height, Boolean(context.options.transparentBackground));
    return this.createResult(context, encodePng(width, height, rgba), entities.length);
  }
}

export class PdfExporter extends BaseExporter {
  readonly format = "pdf" as const;
  readonly label = "PDF";
  readonly extension = "pdf";
  readonly mimeType = "application/pdf";

  async export(context: ExportContext): Promise<ExportResult> {
    const entities = this.getEntities(context);
    const page = getPdfPageSize(context.options.paperFormat ?? "A4", context.options.orientation ?? "landscape");
    const lines = [
      context.project.name,
      context.project.description,
      `Author: ${context.project.author || context.project.settings.export.author || "FORMIQ"}`,
      `Date: ${new Date(context.createdAt).toISOString().slice(0, 10)}`,
      `CRS: ${context.options.crs ?? context.project.crs}`,
      `Features: ${entities.length}`,
      `Buildings: ${context.project.buildings.length}`,
      `Roads: ${context.project.roads.length}`,
      `Water: ${context.project.water.length}`,
      `Green: ${context.project.vegetation.length}`,
      "Legend: buildings, roads, water, greenery, POI, boundaries, terrain",
    ];
    return this.createResult(context, createSimplePdf(page.width, page.height, lines), entities.length);
  }
}

export function createDefaultExportAdapters() {
  return [
    new GeoJsonExporter(),
    new CsvExporter(),
    new KmlExporter(),
    new DxfExporter(),
    new ObjExporter(),
    new GltfExporter(),
    new PngExporter(),
    new PdfExporter(),
  ];
}

function csvValue(entity: FormiqEntity, column: string): unknown {
  const props = entityProperties(entity) ?? {};
  if (column === "longitude" || column === "latitude") {
    const first = getGeometryPositions(entity.geometry)[0];
    return column === "longitude" ? first?.[0] : first?.[1];
  }
  return props[column];
}

function entityToKmlPlacemark(entity: FormiqEntity): string {
  const props = entityProperties(entity) ?? {};
  const extendedData = Object.entries(props)
    .map(([key, value]) => `<Data name="${escapeXml(key)}"><value>${escapeXml(value)}</value></Data>`)
    .join("");
  return `<Placemark>
  <name>${escapeXml(props.name ?? entity.names?.default ?? entity.id)}</name>
  <styleUrl>#${entity.type === "road" ? "road" : entity.type === "poi" ? "poi" : "building"}</styleUrl>
  <ExtendedData>${extendedData}</ExtendedData>
  ${geometryToKml(entity)}
</Placemark>`;
}

function geometryToKml(entity: FormiqEntity): string {
  const geometry = entity.geometry;
  if (geometry.type === "point") return `<Point><coordinates>${geometry.coordinates[0]},${geometry.coordinates[1]},0</coordinates></Point>`;
  if (geometry.type === "line") return `<LineString><coordinates>${coordinatesToKml(geometry.coordinates)}</coordinates></LineString>`;
  const outer = geometry.rings[0] ?? [];
  const inner = geometry.rings.slice(1)
    .map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${coordinatesToKml(ring)}</coordinates></LinearRing></innerBoundaryIs>`)
    .join("");
  return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinatesToKml(outer)}</coordinates></LinearRing></outerBoundaryIs>${inner}</Polygon>`;
}

function coordinatesToKml(coordinates: Position[]): string {
  return coordinates.map((position) => `${position[0]},${position[1]},${position[2] ?? 0}`).join(" ");
}

function dxfPoint(position: Position, layer: string): string[] {
  return ["0", "POINT", "8", layer, "10", String(position[0]), "20", String(position[1]), "30", String(position[2] ?? 0)];
}

function dxfPolyline(coordinates: Position[], layer: string, closed: boolean): string[] {
  const parts = ["0", "LWPOLYLINE", "8", layer, "90", String(coordinates.length), "70", closed ? "1" : "0"];
  coordinates.forEach((position) => parts.push("10", String(position[0]), "20", String(position[1])));
  return parts;
}

function dxf3dFace(geometry: FormiqPolygonGeometry, height: number, layer: string): string[] {
  const ring = geometry.rings[0]?.slice(0, 4) ?? [];
  if (ring.length < 3) return [];
  const points = ring.length === 3 ? [...ring, ring[2]] : ring;
  const parts = ["0", "3DFACE", "8", layer];
  points.slice(0, 4).forEach((point, index) => {
    parts.push(String(10 + index), String(point[0]), String(20 + index), String(point[1]), String(30 + index), String(height));
  });
  return parts;
}

function buildingToObj(building: FormiqBuilding, vertexOffset: number): { lines: string[]; nextVertexOffset: number } {
  const ring = building.geometry.rings[0] ?? [];
  const height = building.absoluteHeight ?? building.height ?? building.heightFromLevels ?? 3;
  const lines = [`o ${sanitizeObjName(building.id)}`];
  ring.forEach((point) => lines.push(`v ${point[0]} ${point[1]} ${building.baseElevation ?? 0}`));
  ring.forEach((point) => lines.push(`v ${point[0]} ${point[1]} ${height}`));
  const count = ring.length;
  if (count >= 3) {
    lines.push(`f ${Array.from({ length: count }, (_, index) => vertexOffset + index).join(" ")}`);
    lines.push(`f ${Array.from({ length: count }, (_, index) => vertexOffset + count + index).reverse().join(" ")}`);
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      lines.push(`f ${vertexOffset + index} ${vertexOffset + next} ${vertexOffset + count + next} ${vertexOffset + count + index}`);
    }
  }
  return { lines, nextVertexOffset: vertexOffset + count * 2 };
}

function sanitizeObjName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function gltfMode(entity: FormiqEntity): number {
  if (entity.geometry.type === "point") return 0;
  if (entity.geometry.type === "line") return 1;
  return 4;
}

function renderPngMap(entities: FormiqEntity[], bounds: { west: number; south: number; east: number; north: number }, width: number, height: number, transparent: boolean): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 248;
    pixels[index + 1] = 250;
    pixels[index + 2] = 252;
    pixels[index + 3] = transparent ? 0 : 255;
  }
  entities.forEach((entity) => {
    const color = colorForEntity(entity);
    const positions = getGeometryPositions(entity.geometry).map((position) => projectPoint(position, bounds, width, height));
    if (entity.geometry.type === "point") drawPoint(pixels, width, height, positions[0], color);
    else drawPath(pixels, width, height, positions, color);
  });
  return pixels;
}

function projectPoint(position: Position, bounds: { west: number; south: number; east: number; north: number }, width: number, height: number): [number, number] {
  const x = Math.round(((position[0] - bounds.west) / Math.max(bounds.east - bounds.west, 0.000001)) * (width - 1));
  const y = Math.round((1 - (position[1] - bounds.south) / Math.max(bounds.north - bounds.south, 0.000001)) * (height - 1));
  return [x, y];
}

function colorForEntity(entity: FormiqEntity): [number, number, number, number] {
  if (entity.type === "building") return [34, 158, 217, 220];
  if (entity.type === "road") return [55, 65, 81, 255];
  if (entity.type === "vegetation") return [34, 197, 94, 210];
  if (entity.type === "water") return [2, 132, 199, 210];
  return [249, 115, 22, 230];
}

function drawPoint(pixels: Uint8Array, width: number, height: number, point: [number, number] | undefined, color: [number, number, number, number]): void {
  if (!point) return;
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) setPixel(pixels, width, height, point[0] + dx, point[1] + dy, color);
  }
}

function drawPath(pixels: Uint8Array, width: number, height: number, points: Array<[number, number]>, color: [number, number, number, number]): void {
  for (let index = 0; index < points.length - 1; index += 1) drawLine(pixels, width, height, points[index], points[index + 1], color);
}

function drawLine(pixels: Uint8Array, width: number, height: number, start: [number, number], end: [number, number], color: [number, number, number, number]): void {
  let [x0, y0] = start;
  const [x1, y1] = end;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    setPixel(pixels, width, height, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function setPixel(pixels: Uint8Array, width: number, height: number, x: number, y: number, color: [number, number, number, number]): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    scanlines.set(rgba.slice(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", zlibStore(scanlines)),
    pngChunk("IEND", new Uint8Array())
  );
}

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8;
  data[9] = 6;
  return data;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = encodeUtf8(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatBytes(typeBytes, data)));
  return output;
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.byteLength; offset += 65535) {
    const block = data.slice(offset, offset + 65535);
    const header = new Uint8Array(5);
    header[0] = offset + 65535 >= data.byteLength ? 1 : 0;
    header[1] = block.byteLength & 0xff;
    header[2] = (block.byteLength >> 8) & 0xff;
    const nlen = (~block.byteLength) & 0xffff;
    header[3] = nlen & 0xff;
    header[4] = (nlen >> 8) & 0xff;
    blocks.push(header, block);
  }
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  blocks.push(checksum);
  return concatBytes(...blocks);
}

function createSimplePdf(width: number, height: number, lines: string[]): Uint8Array {
  const content = [
    "BT",
    "/F1 22 Tf",
    `72 ${height - 72} Td`,
    ...lines.flatMap((line, index) => [
      index === 0 ? "" : "0 -24 Td",
      `(${pdfEscape(line.slice(0, 110))}) Tj`,
    ]),
    "ET",
    "1 w 36 36 " + (width - 72) + " " + (height - 72) + " re S",
  ].filter(Boolean).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encodeUtf8(body);
}

function getPdfPageSize(format: string, orientation: string): { width: number; height: number } {
  const sizes: Record<string, [number, number]> = {
    A4: [595, 842],
    A3: [842, 1191],
    A2: [1191, 1684],
    A1: [1684, 2384],
    A0: [2384, 3370],
  };
  const [short, long] = sizes[format] ?? sizes.A4;
  return orientation === "landscape" ? { width: long, height: short } : { width: short, height: long };
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
