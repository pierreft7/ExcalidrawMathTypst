/** Where a curve label is placed relative to the curve point */
export type LabelSide =
  | "above"
  | "below"
  | "left"
  | "right"
  | "above-left"
  | "above-right"
  | "below-left"
  | "below-right";

/** A single function trace on the graph */
export interface FunctionTrace {
  /** Math expression string, e.g. "sin(x)", "x^2 + 2*x" */
  expression: string;
  /** Display colour */
  color: string;
  /** Optional label drawn on the curve (falls back to the expression) */
  label?: string;
  /** Position of the label along the curve (0–1) */
  labelPos?: number;
  /** Which side of the curve the label sits on */
  labelSide?: LabelSide;
  /** Number of sampling points used by simple-plot */
  samples?: number;
  /** Restrict the plotted domain, if set */
  domainMin?: number;
  domainMax?: number;
  /** Stroke width in pt */
  strokeWidth?: number;
  /** Draw the curve dashed */
  dash?: boolean;
}

/** A data trace from CSV / tabular input */
export interface DataTrace {
  xValues: number[];
  yValues: number[];
  mode: "scatter" | "line";
  color: string;
  label?: string;
  /** simple-plot marker type: "o", "*", "square", "diamond", "none", ... */
  mark?: string;
  /** Marker size in cm */
  markSize?: number;
}

/** Axis configuration */
export interface AxisConfig {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  showGrid: boolean;
  /** Legacy tick interval applied to both axes */
  tickInterval?: number;
  /** Per-axis tick steps (override tickInterval) */
  xTickStep?: number;
  yTickStep?: number;
  /** Also draw minor grid lines */
  showMinorGrid?: boolean;
  /** X-axis position: "auto", "center", "bottom", "none" or a data value */
  axisXPos?: "auto" | "center" | "bottom" | "none" | number;
  /** Y-axis position: "auto", "center", "left", "none" or a data value */
  axisYPos?: "auto" | "center" | "left" | "none" | number;
  /** Show the "0" origin label */
  showOrigin?: boolean;
  /** Show the tick/label at xmax/ymax */
  showEndTicks?: boolean;
  /** Tick label font size in pt */
  tickLabelSize?: number;
}

/** Named placement presets for the zoom inset (simple-plot `at`) */
export type ZoomAtPreset =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "top"
  | "bottom"
  | "left"
  | "right";

/** Where the zoom inset is placed: auto, a corner/edge preset, or data coords */
export type ZoomAt = "auto" | ZoomAtPreset | [number, number];

/** Spy-glass zoom inset (simple-plot `zoom()`) */
export interface ZoomSpec {
  /** Center of the magnified region in data coordinates */
  center: [number, number];
  /** Size of the region in cm (square) */
  size: number;
  /** Zoom factor of the inset */
  magnification?: number;
  /** Inset placement: auto, preset (e.g. "bottom-right"), or (x, y) data coords */
  at?: ZoomAt;
  lensShape?: "rect" | "circle";
  /** Accent colour for connectors */
  accent?: string;
  showInsetGrid?: boolean;
}

/** Full graph configuration stored in element customData for click-to-edit */
export interface GraphConfig {
  functions: FunctionTrace[];
  dataTraces: DataTrace[];
  axis: AxisConfig;
  width: number;
  height: number;
  /** Background colour — "transparent" or a CSS colour string */
  backgroundColor: string;
  /** Optional spy-glass zoom inset */
  zoom?: ZoomSpec | null;
}

/** Available colours for function traces */
export const TRACE_COLORS = [
  "#6965db", // purple
  "#e03131", // red
  "#2f9e44", // green
  "#e8590c", // orange
  "#1971c2", // blue
];

export function createDefaultAxisConfig(): AxisConfig {
  return {
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    xLabel: "x",
    yLabel: "y",
    showGrid: true,
    showOrigin: true,
    showEndTicks: true,
  };
}

export function createDefaultGraphConfig(): GraphConfig {
  return {
    functions: [{ expression: "", color: TRACE_COLORS[0] }],
    dataTraces: [],
    axis: createDefaultAxisConfig(),
    width: 500,
    height: 400,
    backgroundColor: "transparent",
    zoom: null,
  };
}
