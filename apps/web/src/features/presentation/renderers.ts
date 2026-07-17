import { getRasterPixelSize, type LayoutDocument } from "./layoutDocument";

export interface RenderOptions {
  dpi?: number;
}

export interface LayoutRenderer<TOutput> {
  render(document: LayoutDocument, options?: RenderOptions): Promise<TOutput>;
}

export const SvgLayoutRenderer: LayoutRenderer<string> = {
  async render(document) {
    assertRenderable(document);
    return document.svgMarkup;
  },
};

export interface RasterSheet {
  width: number;
  height: number;
  png: Uint8Array;
  jpeg: Uint8Array;
}

export const PngLayoutRenderer: LayoutRenderer<Uint8Array> = {
  async render(document, options) {
    const raster = await rasterizeLayoutDocument(document, options?.dpi ?? 300);
    return raster.png;
  },
};

export const RasterPdfLayoutRenderer: LayoutRenderer<Uint8Array> = {
  async render(document, options) {
    const raster = await rasterizeLayoutDocument(document, options?.dpi ?? 300);
    return createRasterPdf(raster, document);
  },
};

export async function renderRasterPdfAlbum(documents: LayoutDocument[], dpi: number): Promise<Uint8Array> {
  if (!documents.length) throw new Error("No renderable layout documents in album");
  const rasters = await Promise.all(documents.map((document) => rasterizeLayoutDocument(document, dpi)));
  return createRasterPdfAlbum(rasters, documents);
}

export async function rasterizeLayoutDocument(document: LayoutDocument, dpi: number): Promise<RasterSheet> {
  assertRenderable(document);
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("Raster rendering requires a browser context");
  }
  const { width, height } = getRasterPixelSize(document, dpi);
  const url = URL.createObjectURL(new Blob([document.svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare raster canvas");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const toBlob = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to create export image")), type, quality));
    const [png, jpeg] = await Promise.all([toBlob("image/png"), toBlob("image/jpeg", 0.96)]);
    return { width, height, png: new Uint8Array(await png.arrayBuffer()), jpeg: new Uint8Array(await jpeg.arrayBuffer()) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function assertRenderable(document: LayoutDocument): void {
  if (document.readiness.state === "no-data" || document.readiness.state === "unsupported") {
    throw new Error(`Layout export is unavailable: ${document.readiness.summary}`);
  }
}

export function createRasterPdf(raster: RasterSheet, document: LayoutDocument): Uint8Array {
  return createRasterPdfAlbum([raster], [document]);
}

export function createRasterPdfAlbum(rasters: RasterSheet[], documents: LayoutDocument[]): Uint8Array {
  const encoder = new TextEncoder();
  const text = (value: string) => encoder.encode(value);
  const join = (chunks: Uint8Array[]) => {
    const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
    return result;
  };
  const pageObjects = documents.map((document, index) => {
    const pageWidth = Number((document.page.widthMm * (72 / 25.4)).toFixed(2));
    const pageHeight = Number((document.page.heightMm * (72 / 25.4)).toFixed(2));
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    const content = text(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`);
    return [
      text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`),
      join([text(`<< /Length ${content.length} >>\nstream\n`), content, text("\nendstream")]),
      join([text(`<< /Type /XObject /Subtype /Image /Width ${rasters[index].width} /Height ${rasters[index].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rasters[index].jpeg.length} >>\nstream\n`), rasters[index].jpeg, text("\nendstream")]),
    ];
  }).flat();
  const kids = documents.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  const objects = [
    text("<< /Type /Catalog /Pages 2 0 R >>"),
    text(`<< /Type /Pages /Kids [${kids}] /Count ${documents.length} >>`),
    ...pageObjects,
  ];
  const header = text("%PDF-1.4\n%FORMIQ raster layout\n");
  const offsets: number[] = [0];
  const chunks: Uint8Array[] = [header];
  let offset = header.length;
  objects.forEach((object, index) => {
    const wrapped = join([text(`${index + 1} 0 obj\n`), object, text("\nendobj\n")]);
    offsets.push(offset);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return join([...chunks, text(xref)]);
}
