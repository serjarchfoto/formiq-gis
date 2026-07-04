"use client";

import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { ThematicMapDefinition } from "@/lib/gis-engine/thematic/types";

export type ExportFormat = "png" | "pdf" | "geojson" | "psd" | "svg";

const SVG_WIDTH = 1400;
const SVG_HEIGHT = 1000;
const SVG_PADDING = 64;

export class ExportService {
  async exportProject(_format: ExportFormat): Promise<never> {
    void _format;
    throw new Error("Project export is not implemented yet.");
  }

  exportThematicMap(
    thematicMap: ThematicMapDefinition,
    format: Extract<ExportFormat, "geojson" | "svg">
  ): void {
    const fileName = createSafeFileName(thematicMap.title);

    if (format === "geojson") {
      this.downloadFile(
        `${fileName}.geojson`,
        JSON.stringify(thematicMap.geojson, null, 2),
        "application/geo+json;charset=utf-8"
      );
      return;
    }

    this.downloadFile(
      `${fileName}.svg`,
      buildThematicMapSvg(thematicMap),
      "image/svg+xml;charset=utf-8"
    );
  }

  private downloadFile(fileName: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function buildThematicMapSvg(thematicMap: ThematicMapDefinition): string {
  const bounds = getFeatureCollectionBounds(thematicMap.geojson);
  const drawableWidth = SVG_WIDTH - SVG_PADDING * 2;
  const drawableHeight = SVG_HEIGHT - SVG_PADDING * 2;
  const scaleX = drawableWidth / Math.max(bounds.east - bounds.west, 0.000001);
  const scaleY = drawableHeight / Math.max(bounds.north - bounds.south, 0.000001);
  const scale = Math.min(scaleX, scaleY);
  const legend = thematicMap.legend.filter((item) => item.count > 0);
  const geometryMarkup = thematicMap.geojson.features
    .map((feature) => renderFeature(feature, bounds, scale))
    .join("\n");
  const legendMarkup = legend
    .map((item, index) => {
      const top = 140 + index * 30;

      return [
        `<rect x="${SVG_WIDTH - 360}" y="${top}" width="14" height="14" rx="7" fill="${item.color}" />`,
        `<text x="${SVG_WIDTH - 336}" y="${top + 11}" font-size="16" fill="#1F2937">${escapeXml(item.label)}</text>`,
        `<text x="${SVG_WIDTH - 110}" y="${top + 11}" font-size="16" fill="#111827" text-anchor="end">${item.count}</text>`,
      ].join("");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#F8FAFC" />
  <rect x="24" y="24" width="${SVG_WIDTH - 48}" height="${SVG_HEIGHT - 48}" rx="24" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5" />
  <text x="${SVG_PADDING}" y="78" font-size="34" font-weight="700" fill="#111827">${escapeXml(thematicMap.title)}</text>
  <text x="${SVG_PADDING}" y="108" font-size="16" fill="#6B7280">${escapeXml(thematicMap.description)}</text>
  <g>
    ${geometryMarkup}
  </g>
  <rect x="${SVG_WIDTH - 392}" y="88" width="300" height="${Math.max(legend.length * 30 + 40, 90)}" rx="18" fill="#FFFFFF" stroke="#E5E7EB" />
  <text x="${SVG_WIDTH - 360}" y="118" font-size="20" font-weight="700" fill="#111827">Legend</text>
  ${legendMarkup}
</svg>`;
}

function renderFeature(
  feature: Feature<Geometry>,
  bounds: Bounds,
  scale: number
): string {
  const fill = String(feature.properties?.renderColor ?? "#94A3B8");

  if (feature.geometry.type === "Polygon") {
    const rings = feature.geometry.coordinates
      .map((ring) => polygonPath(ring as Position[], bounds, scale))
      .join(" ");

    return `<path d="${rings}" fill="${fill}" fill-opacity="0.88" stroke="${fill}" stroke-opacity="0.95" stroke-width="1.2" />`;
  }

  if (feature.geometry.type === "LineString") {
    const path = linePath(feature.geometry.coordinates as Position[], bounds, scale);
    return `<path d="${path}" fill="none" stroke="${fill}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  if (feature.geometry.type === "Point") {
    const [x, y] = projectPosition(feature.geometry.coordinates as Position, bounds, scale);
    return `<circle cx="${x}" cy="${y}" r="4.5" fill="${fill}" stroke="#FFFFFF" stroke-width="1.5" />`;
  }

  return "";
}

function polygonPath(ring: Position[], bounds: Bounds, scale: number): string {
  return ring
    .map((position, index) => {
      const [x, y] = projectPosition(position, bounds, scale);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function linePath(line: Position[], bounds: Bounds, scale: number): string {
  return line
    .map((position, index) => {
      const [x, y] = projectPosition(position, bounds, scale);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function projectPosition(position: Position, bounds: Bounds, scale: number): [number, number] {
  const x = SVG_PADDING + (position[0] - bounds.west) * scale;
  const y = SVG_HEIGHT - SVG_PADDING - (position[1] - bounds.south) * scale;

  return [x, y];
}

function getFeatureCollectionBounds(collection: FeatureCollection<Geometry>): Bounds {
  const positions = collection.features.flatMap((feature) => flattenGeometryPositions(feature.geometry));

  if (positions.length === 0) {
    return {
      west: 0,
      south: 0,
      east: 1,
      north: 1,
    };
  }

  return {
    west: Math.min(...positions.map((position) => position[0])),
    south: Math.min(...positions.map((position) => position[1])),
    east: Math.max(...positions.map((position) => position[0])),
    north: Math.max(...positions.map((position) => position[1])),
  };
}

function flattenGeometryPositions(geometry: Geometry): Position[] {
  if (geometry.type === "Point") {
    return [geometry.coordinates as Position];
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates as Position[];
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat() as Position[];
  }

  return [];
}

function createSafeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "formiq-map";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}
