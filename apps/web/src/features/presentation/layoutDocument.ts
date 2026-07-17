import type { BoundingBox } from "@/types/gis";

export type LayoutFormat = "A4" | "A3" | "A2" | "A1" | "A0";
export type LayoutOrientation = "portrait" | "landscape";
export type ExportReadiness = "ready" | "partial" | "no-data" | "unsupported";

export interface PageDefinition {
  format: LayoutFormat;
  orientation: LayoutOrientation;
  widthMm: number;
  heightMm: number;
  marginsMm: { top: number; right: number; bottom: number; left: number };
}

export interface LayoutMapDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds?: BoundingBox;
  scaleDenominator: number;
  sourceCrs: string;
  displayCrs: string;
  thematicMapId: string;
}

export interface LayoutElement {
  id: string;
  type: "text" | "shape" | "line" | "image";
  label: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMetadata {
  title: string;
  subtitle: string;
  author: string;
  date: string;
  projectId: string;
  projectName: string;
  sourceCrs: string;
  displayCrs: string;
  provenance: string[];
}

export interface LayoutDocument {
  version: 1;
  previewZoom: number;
  rasterDpi: number;
  page: PageDefinition;
  map: LayoutMapDefinition;
  elements: LayoutElement[];
  metadata: LayoutMetadata;
  readiness: {
    state: ExportReadiness;
    coveragePercent: number;
    knownCount: number;
    totalCount: number;
    summary: string;
  };
  /** Canonical SVG scene shared by preview, thumbnail and export renderers. */
  svgMarkup: string;
}

export interface LayoutDocumentInput {
  previewZoom: number;
  rasterDpi: number;
  page: PageDefinition;
  map: LayoutMapDefinition;
  elements: LayoutElement[];
  metadata: LayoutMetadata;
  readiness: LayoutDocument["readiness"];
  svgMarkup: string;
}

export function buildLayoutDocument(input: LayoutDocumentInput): LayoutDocument {
  return {
    version: 1,
    previewZoom: input.previewZoom,
    rasterDpi: input.rasterDpi,
    page: { ...input.page, marginsMm: { ...input.page.marginsMm } },
    map: { ...input.map, bounds: input.map.bounds ? { ...input.map.bounds } : undefined },
    elements: input.elements.map((element) => ({ ...element })),
    metadata: { ...input.metadata, provenance: [...input.metadata.provenance] },
    readiness: { ...input.readiness },
    svgMarkup: input.svgMarkup,
  };
}

export const pageSizesMm: Record<LayoutFormat, { width: number; height: number }> = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
};

export function createPageDefinition(format: LayoutFormat, orientation: LayoutOrientation, marginsMm: number): PageDefinition {
  const size = pageSizesMm[format];
  const landscape = orientation === "landscape";
  return {
    format,
    orientation,
    widthMm: landscape ? size.width : size.height,
    heightMm: landscape ? size.height : size.width,
    marginsMm: { top: marginsMm, right: marginsMm, bottom: marginsMm, left: marginsMm },
  };
}

export function getRasterPixelSize(document: LayoutDocument, dpi: number): { width: number; height: number } {
  return {
    width: Math.round((document.page.widthMm / 25.4) * dpi),
    height: Math.round((document.page.heightMm / 25.4) * dpi),
  };
}
