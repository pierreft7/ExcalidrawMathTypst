/**
 * @module graph/plotRenderer
 *
 * Renders graph configurations to SVG using the Typst `simple-plot` package
 * through the shared Typst compiler worker. The SVG output is converted to
 * a data URL downstream for embedding as an Excalidraw image element.
 */

import { renderTypstDocumentToSvg, TypstRenderError } from "../typst/compile";
import { expressionToTypstLambda } from "./expressionToTypst";
import type { GraphConfig, ZoomSpec } from "./types";

const SIMPLE_PLOT_VERSION = "1.0.0";
/** Convert the pixel-sized config to Typst points (96dpi → 72dpi). */
const PX_TO_PT = 0.75;

const SUPERSCRIPTS: Record<string, string> = {
  "\u00B9": "1", "\u00B2": "2", "\u00B3": "3",
  "\u2070": "0", "\u2074": "4", "\u2075": "5", "\u2076": "6",
  "\u2077": "7", "\u2078": "8", "\u2079": "9",
  "\u207F": "n", "\u02E3": "x", "\u207B": "-", "\u207A": "+",
};

/** Compact number formatting — no scientific notation for common ranges. */
function fmt(n: number): string {
  return String(parseFloat(n.toPrecision(12))).replace("e+", "e");
}

/** Number formatting that always keeps decimal notation (Typst float). */
function fmtDec(n: number): string {
  const s = fmt(n);
  return s.includes(".") ? s : `${s}.0`;
}

/** Escape plain-text content for a Typst `[...]` markup block. */
function escapeText(label: string): string {
  return label
    .replace(/\\/g, "\\u{005c}")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/#/g, "\\#")
    .replace(/@/g, "\\@")
    .replace(/\s+/g, " ");
}

/**
 * Convert a user-facing label into Typst content: math mode for formula-like
 * labels ("y = x²" → $y = x^2$), plain text otherwise ("upper" → [upper]).
 */
export function labelToTypstContent(label: string): string {
  if (!label) return "none";
  const mathy = /[\d^_*/=<>+\-.,()[\]]|[\u00B9\u00B2\u00B3\u2070-\u209F\u02E3]/u.test(label);
  if (!mathy) return `[${escapeText(label)}]`;
  let out = "";
  for (const ch of label) {
    if (ch in SUPERSCRIPTS) out += `^${SUPERSCRIPTS[ch]}`;
    else if (ch === "$") out += "\\$";
    else if (ch === "#") out += "\\#";
    else if (ch === "|") out += " mid ";
    else out += ch;
  }
  return `$${out.trim().replace(/ {2,}/g, " ")}$`;
}

function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Wrap a label so it renders in the given colour (curve colour). */
function colorLabel(content: string, color: string): string {
  if (content === "none") return "none";
  return `text(fill: rgb("${color}"), ${content})`;
}

/**
 * Adaptive sample count: smooth curves need more segments over wide ranges.
 * simple-plot samples a function over its `domain`, which we always set to
 * the plotted x-range, so `samples` maps 1:1 to visible segments. ~12 points
 * per data unit keeps e.g. a sine at ~75 segments per period.
 */
function computeSamples(
  fn: GraphConfig["functions"][number],
  xMin: number,
  xMax: number
): number {
  if (fn.samples != null) return Math.round(fn.samples);
  const domainMin = fn.domainMin ?? xMin;
  const domainMax = fn.domainMax ?? xMax;
  return Math.max(200, Math.min(3000, Math.ceil(Math.abs(domainMax - domainMin) * 12)));
}

function buildFunctionSpec(
  fn: GraphConfig["functions"][number],
  xMin: number,
  xMax: number
): string | null {
  try {
    const lambda = expressionToTypstLambda(fn.expression);
    const thickness = fn.strokeWidth ?? 1.2;
    const stroke = fn.dash
      ? `(paint: rgb("${fn.color}"), thickness: ${thickness}pt, dash: "dashed")`
      : `rgb("${fn.color}") + ${thickness}pt`;

    let spec = `(fn: ${lambda}, stroke: ${stroke}`;
    const label = colorLabel(
      fn.label === "" ? "none" : labelToTypstContent(fn.label ?? fn.expression),
      fn.color
    );
    if (label !== "none") spec += `, label: ${label}`;
    if (fn.labelPos != null) spec += `, label-pos: ${fmt(fn.labelPos)}`;
    if (fn.labelSide) spec += `, label-side: "${fn.labelSide}"`;
    spec += `, samples: ${computeSamples(fn, xMin, xMax)}`;
    // Always sample over the plotted range (or the explicit domain), like
    // simple-plot's own `plot-fn` wrapper. Without a domain, simple-plot
    // samples over an inflated span (half the largest axis range on each
    // side), halving the visible curve density.
    const domainMin = fn.domainMin ?? xMin;
    const domainMax = fn.domainMax ?? xMax;
    spec += `, domain: (${fmtDec(domainMin)}, ${fmtDec(domainMax)})`;
    return `${spec})`;
  } catch {
    // Skip expressions that cannot be translated to Typst.
    return null;
  }
}

function buildDataSpec(dt: GraphConfig["dataTraces"][number]): string {
  const points = dt.xValues
    .map((x, i) => `(${fmtDec(x)}, ${fmtDec(dt.yValues[i] ?? NaN)})`)
    .join(", ");
  const label = colorLabel(labelToTypstContent(dt.label ?? ""), dt.color);
  if (dt.mode === "line") {
    return `line-plot(((${points})), stroke: rgb("${dt.color}") + 1pt, mark: "${dt.mark ?? "none"}", label: ${label})`;
  }
  return `data(((${points})), mark: "${dt.mark ?? "o"}", mark-size: ${dt.markSize ?? 0.08}, mark-fill: rgb("${dt.color}"), label: ${label})`;
}

type LegacyZoom = ZoomSpec & { region?: [number, number, number, number] };

function buildZoomSpec(zoom: LegacyZoom, backgroundColor: string): string {
  const legacy = zoom.center == null || zoom.size == null;
  let spec: string;
  if (legacy && zoom.region) {
    // Legacy configs used explicit region corners.
    const [x1, y1, x2, y2] = zoom.region;
    spec = `zoom(region: (${fmt(x1)}, ${fmt(y1)}, ${fmt(x2)}, ${fmt(y2)})`;
  } else {
    spec = `zoom(center: (${fmt(zoom.center[0])}, ${fmt(zoom.center[1])}), size: ${fmt(zoom.size)}`;
  }
  if (zoom.magnification != null) spec += `, magnification: ${fmt(zoom.magnification)}`;
  if (zoom.at != null && zoom.at !== "auto") {
    spec += typeof zoom.at === "string"
      ? `, at: "${zoom.at}"`
      : `, at: (${fmt(zoom.at[0])}, ${fmt(zoom.at[1])})`;
  }
  spec += `, lens-shape: "${zoom.lensShape ?? "rect"}"`;
  spec += `, show-inset-grid: ${zoom.showInsetGrid ?? true}`;
  if (zoom.accent) spec += `, accent: rgb("${zoom.accent}")`;
  // Match the magnified inset's background to the plot background.
  spec += backgroundColor === "transparent"
    ? ", box-fill: none"
    : `, box-fill: rgb("${backgroundColor}")`;
  return `${spec})`;
}

/** Build a complete Typst document for a graph config. */
export function buildGraphTypstDocument(config: GraphConfig): string {
  const { functions, dataTraces, axis } = config;

  const bg = config.backgroundColor;
  const dark = bg !== "transparent" && isDarkColor(bg);
  const fg = dark ? "#e8e8e8" : "#1b1b1b";

  const style: string[] = [
    `background: (fill: ${bg === "transparent" ? "none" : `rgb("${bg}")`})`,
    `axis: (stroke: rgb("${fg}") + 0.7pt, arrow: (symbol: "stealth", fill: rgb("${fg}"), scale: 0.55))`,
    `labels: (fill: rgb("${fg}")${dark ? `, bg: rgb("#3c3c3c")` : ""})`,
    `ticks: (label-fill: rgb("${fg}")${dark ? `, label-bg: rgb("#3c3c3c")` : ""})`,
  ];
  if (dark) {
    // Keep grids legible on dark backgrounds.
    style.push(`grid: (major: (stroke: luma(120) + 0.5pt), minor: (stroke: luma(80) + 0.3pt))`);
  }

  const args: string[] = [
    `width: ${(config.width * PX_TO_PT).toFixed(1)}pt`,
    `height: ${(config.height * PX_TO_PT).toFixed(1)}pt`,
    `xmin: ${fmt(axis.xMin)}, xmax: ${fmt(axis.xMax)}, ymin: ${fmt(axis.yMin)}, ymax: ${fmt(axis.yMax)}`,
    `xlabel: ${axis.xLabel ? labelToTypstContent(axis.xLabel) : "none"}`,
    `ylabel: ${axis.yLabel ? labelToTypstContent(axis.yLabel) : "none"}`,
    axis.showGrid
      ? `show-grid: ${axis.showMinorGrid ? '"both"' : '"major"'}`
      : "show-grid: false",
    `show-origin: ${axis.showOrigin ?? true}`,
    `show-end-ticks: ${axis.showEndTicks ?? true}`,
    `style: (\n    ${style.join(",\n    ")}\n  )`,
  ];

  if (axis.tickLabelSize != null) args.push(`tick-label-size: ${fmt(axis.tickLabelSize)}pt`);
  const xTickStep = axis.xTickStep ?? axis.tickInterval;
  const yTickStep = axis.yTickStep ?? axis.tickInterval;
  if (xTickStep != null) args.push(`xtick-step: ${fmt(xTickStep)}`);
  if (yTickStep != null) args.push(`ytick-step: ${fmt(yTickStep)}`);

  if (axis.axisXPos && axis.axisXPos !== "auto") {
    args.push(`axis-x-pos: ${axis.axisXPos === "none" ? "none" : typeof axis.axisXPos === "string" ? `"${axis.axisXPos}"` : fmt(axis.axisXPos)}`);
  }
  if (axis.axisYPos && axis.axisYPos !== "auto") {
    args.push(`axis-y-pos: ${axis.axisYPos === "none" ? "none" : typeof axis.axisYPos === "string" ? `"${axis.axisYPos}"` : fmt(axis.axisYPos)}`);
  }

  for (const fn of functions) {
    if (!fn.expression.trim()) continue;
    const spec = buildFunctionSpec(fn, axis.xMin, axis.xMax);
    if (spec) args.push(spec);
  }
  for (const dt of dataTraces) args.push(buildDataSpec(dt));
  if (config.zoom) args.push(buildZoomSpec(config.zoom, config.backgroundColor));

  return [
    "#set page(width: auto, height: auto, margin: 4pt, fill: none)",
    `#set text(font: "Libertinus Serif", size: 10pt)`,
    `#import "@preview/simple-plot:${SIMPLE_PLOT_VERSION}": plot, data, line-plot, zoom`,
    `#plot(`,
    `  ${args.join(",\n  ")}`,
    `)`,
  ].join("\n");
}

/**
 * Render a graph config to an SVG string using Typst simple-plot.
 */
export async function renderGraphToSvg(
  config: GraphConfig,
  options: { latestOnly?: boolean } = {},
): Promise<{ svg: string; width: number; height: number }> {
  const hasTrace =
    config.functions.some((fn) => fn.expression.trim()) ||
    config.dataTraces.length > 0;
  if (!hasTrace) throw new TypstRenderError("No valid traces to plot");

  const source = buildGraphTypstDocument(config);
  return renderTypstDocumentToSvg(source, { latestOnly: options.latestOnly ?? false });
}

/**
 * Parse CSV text into x/y arrays for data plot mode.
 * Expects rows of "x,y" values, one per line. Header row is auto-detected.
 */
export function parseCsvData(
  csv: string
): { xValues: number[]; yValues: number[] } {
  const lines = csv.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("No data found");

  const xValues: number[] = [];
  const yValues: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/[,\t]+/).map((s) => s.trim());
    if (parts.length < 2) continue;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);

    // Skip header row (non-numeric)
    if (isNaN(x) || isNaN(y)) {
      if (i === 0) continue; // likely header
      continue;
    }

    xValues.push(x);
    yValues.push(y);
  }

  if (xValues.length === 0) throw new Error("No valid numeric data found");
  return { xValues, yValues };
}
