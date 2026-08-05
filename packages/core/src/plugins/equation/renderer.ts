/** Native Typst equation compilation and SVG rendering. */

import {
  renderTypstDocumentToSvg,
  TypstRenderError,
  TypstRenderSupersededError,
  type RenderResult,
} from "../typst/compile";

export type EquationRenderer = (
  source: string,
  options?: { fontSize?: number; latestOnly?: boolean },
) => Promise<RenderResult>;

export function typstEquationDocument(source: string, fontSize = 24) {
  return [
    "#set page(width: auto, height: auto, margin: 10pt, fill: none)",
    `#set text(font: "Libertinus Serif", size: ${fontSize}pt, fill: rgb("#1e1e1e"))`,
    `#box($ ${source} $)`,
  ].join("\n");
}

/** Compile native Typst math content and return one self-contained SVG. */
export const renderTypstToSvg: EquationRenderer = async (
  source: string,
  options = {},
) => {
  if (!source.trim()) throw new TypstRenderError("Enter a Typst equation.");
  const result = await renderTypstDocumentToSvg(
    typstEquationDocument(source, options.fontSize),
    { latestOnly: options.latestOnly ?? false },
  );
  return result;
};

export type { TypstDiagnostic } from "../typst/workerTypes";
export type { RenderResult } from "../typst/compile";
export { TypstRenderError, TypstRenderSupersededError };
