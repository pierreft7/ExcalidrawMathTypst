// ── Components ──
export { ExcaliMath } from "./ui/ExcaliMath";
export { EquationPanel } from "./ui/EquationPanel";
export { GraphPanel } from "./ui/GraphPanel";

// ── Core utilities ──
export {
  createImageElement,
  svgToDataUrl,
  isExcalimathElement,
  getExcalimathMetadata,
} from "./core/elementFactory";
export { getSelectedExcalimathElement } from "./core/stateBridge";
export {
  restoreExcalimathFilesAsync,
  extractExcalimathData,
} from "./core/roundTrip";
export type { RestorableElement, RestoredFileEntry } from "./core/roundTrip";

// ── Equation plugin ──
export {
  renderTypstToSvg,
  typstEquationDocument,
  TypstRenderError,
  TypstRenderSupersededError,
} from "./plugins/equation/renderer";
export {
  expressionLibrary,
  getCategories,
  filterExpressions,
} from "./plugins/equation/expressionLibrary";

// ── Graph plugin ──
export {
  evaluateFunction,
  validateExpression,
} from "./plugins/graph/evaluator";
export {
  renderGraphToSvg,
  parseCsvData,
} from "./plugins/graph/plotRenderer";
export {
  plotTemplates,
  TRACE_COLORS,
  createDefaultAxisConfig,
  createDefaultGraphConfig,
} from "./plugins/graph";

// ── Shape Libraries plugin ──
export {
  builtInPacks,
  shapeToExcalidrawElements,
  parseExcalidrawLib,
  searchShapes,
} from "./plugins/geometry";
export { LibraryPanel } from "./ui/LibraryPanel";
export { PresentationMode, SlidesPanel } from "./ui/SlidesPanel";

// ── Slides plugin ──
export {
  PRESENTATION_ORDER_KEY,
  applySlideOrder,
  getSlides,
  getSlideLabel,
  reorderSlideIds,
} from "./plugins/slides";

// ── Theme ──
export { getTheme } from "./ui/theme";
export type { ThemeTokens } from "./ui/theme";

// ── Types ──
export type {
  ExcalimathMetadata,
  InsertElementOptions,
  ExcalimathPlugin,
} from "./core/types";
export type { ExpressionEntry } from "./plugins/equation/expressionLibrary";
export type { RenderResult } from "./plugins/equation/renderer";
export type { EquationRenderer, TypstDiagnostic } from "./plugins/equation/renderer";
export type {
  FunctionTrace,
  DataTrace,
  AxisConfig,
  GraphConfig,
} from "./plugins/graph/types";
export type { PlotTemplate } from "./plugins/graph/templates";
export type {
  LibraryPack,
  LibraryShape,
  ExcalidrawLibElement,
} from "./plugins/geometry/types";
export type { ExcaliMathProps, ExcalimathSceneData, ActiveTab } from "./ui/ExcaliMath";
export type { EquationPanelProps } from "./ui/EquationPanel";
export type { GraphPanelProps } from "./ui/GraphPanel";
export type { LibraryPanelProps } from "./ui/LibraryPanel";
export type { SlidesPanelProps } from "./ui/SlidesPanel";
export type { PresentationModeProps } from "./ui/SlidesPanel";
export type { SlideFrame } from "./plugins/slides";
