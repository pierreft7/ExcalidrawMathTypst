/** Regenerates ExcaliMath SVG file entries from Typst or graph metadata. */

import { createFileEntry, getExcalimathMetadata, isExcalimathElement, svgToDataUrl } from "./elementFactory";
import { renderTypstToSvg } from "../plugins/equation/renderer";

export interface RestorableElement {
  id: string;
  type: string;
  fileId?: string;
  customData?: Record<string, unknown>;
}

export interface RestoredFileEntry {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
  lastRetrieved: number;
}

/**
 * Restore every native Typst equation and graph asynchronously.
 * Legacy `excalimath_latex` metadata is intentionally ignored.
 */
export async function restoreExcalimathFilesAsync(
  elements: RestorableElement[],
): Promise<RestoredFileEntry[]> {
  const files: RestoredFileEntry[] = [];

  for (const element of elements) {
    if (element.type !== "image" || !element.fileId || !isExcalimathElement(element)) continue;
    const metadata = getExcalimathMetadata(element);
    if (!metadata) continue;

    try {
      if (metadata.excalimath_type === "equation" && metadata.excalimath_typst) {
        const result = await renderTypstToSvg(metadata.excalimath_typst);
        const { fileEntry } = createFileEntry(svgToDataUrl(result.svg), element.fileId);
        files.push(fileEntry);
      } else if (metadata.excalimath_type === "graph" && metadata.excalimath_graph_config) {
        const config = JSON.parse(metadata.excalimath_graph_config);
        const { renderGraphToSvg } = await import("../plugins/graph/plotRenderer");
        const result = await renderGraphToSvg(config);
        const { fileEntry } = createFileEntry(svgToDataUrl(result.svg), element.fileId);
        files.push(fileEntry);
      }
    } catch {
      // One invalid element must not prevent the rest of the scene from loading.
    }
  }

  return files;
}

export function extractExcalimathData(
  elements: Array<{ id: string; customData?: Record<string, unknown> }>,
): Array<{ elementId: string; type: string; data: Record<string, unknown> }> {
  const results: Array<{ elementId: string; type: string; data: Record<string, unknown> }> = [];
  for (const element of elements) {
    if (!isExcalimathElement(element)) continue;
    const metadata = getExcalimathMetadata(element);
    if (!metadata) continue;
    results.push({
      elementId: element.id,
      type: metadata.excalimath_type,
      data: metadata as unknown as Record<string, unknown>,
    });
  }
  return results;
}
