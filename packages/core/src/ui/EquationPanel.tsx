import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderTypstToSvg,
  TypstRenderSupersededError,
  type EquationRenderer,
  type RenderResult,
} from "../plugins/equation/renderer";
import {
  expressionLibrary,
  filterExpressions,
  getCategories,
  type ExpressionEntry,
} from "../plugins/equation/expressionLibrary";
import { getTheme } from "./theme";

export interface EquationPanelProps {
  onInsert: (typst: string, svg: string, width: number, height: number) => void | Promise<void>;
  editingTypst?: string | null;
  onClose: () => void;
  visible: boolean;
  isDark?: boolean;
  /** Optional host renderer, allowing an app to reuse its existing Typst worker. */
  renderEquation?: EquationRenderer;
}

interface ToolbarButton {
  label: string;
  template: string;
  title: string;
}

const toolbarGroups: Array<{ name: string; buttons: ToolbarButton[] }> = [
  {
    name: "Structure",
    buttons: [
      { label: "a⁄b", template: "frac(◻, ◻)", title: "Fraction" },
      { label: "xⁿ", template: "^(◻)", title: "Superscript" },
      { label: "xₙ", template: "_(◻)", title: "Subscript" },
      { label: "√x", template: "sqrt(◻)", title: "Square root" },
      { label: "ⁿ√x", template: "root(◻, ◻)", title: "nth root" },
      { label: "( )", template: "(◻)", title: "Parentheses" },
    ],
  },
  {
    name: "Operators",
    buttons: [
      { label: "±", template: "plus.minus ", title: "Plus-minus" },
      { label: "×", template: "times ", title: "Times" },
      { label: "÷", template: "div ", title: "Divide" },
      { label: "·", template: "dot ", title: "Dot" },
      { label: "≤", template: "<= ", title: "Less or equal" },
      { label: "≥", template: ">= ", title: "Greater or equal" },
      { label: "≠", template: "!= ", title: "Not equal" },
      { label: "≈", template: "approx ", title: "Approximately" },
    ],
  },
  {
    name: "Calculus",
    buttons: [
      { label: "∫", template: "integral_(◻)^(◻) ◻ dif ◻", title: "Integral" },
      { label: "∑", template: "sum_(◻)^(◻) ◻", title: "Summation" },
      { label: "∏", template: "product_(◻)^(◻) ◻", title: "Product" },
      { label: "lim", template: "lim_(◻ -> ◻) ◻", title: "Limit" },
      { label: "d/dx", template: "frac(dif ◻, dif ◻)", title: "Derivative" },
      { label: "∂/∂x", template: "frac(partial ◻, partial ◻)", title: "Partial derivative" },
      { label: "∞", template: "infinity", title: "Infinity" },
    ],
  },
  {
    name: "Greek",
    buttons: [
      { label: "α", template: "alpha", title: "Alpha" },
      { label: "β", template: "beta", title: "Beta" },
      { label: "γ", template: "gamma", title: "Gamma" },
      { label: "δ", template: "delta", title: "Delta" },
      { label: "θ", template: "theta", title: "Theta" },
      { label: "λ", template: "lambda", title: "Lambda" },
      { label: "π", template: "pi", title: "Pi" },
      { label: "σ", template: "sigma", title: "Sigma" },
      { label: "ω", template: "omega", title: "Omega" },
      { label: "Δ", template: "Delta", title: "Delta (capital)" },
      { label: "Σ", template: "Sigma", title: "Sigma (capital)" },
    ],
  },
  {
    name: "Functions",
    buttons: [
      { label: "sin", template: "sin(◻)", title: "Sine" },
      { label: "cos", template: "cos(◻)", title: "Cosine" },
      { label: "tan", template: "tan(◻)", title: "Tangent" },
      { label: "log", template: "log(◻)", title: "Logarithm" },
      { label: "ln", template: "ln(◻)", title: "Natural logarithm" },
    ],
  },
  {
    name: "Layout",
    buttons: [
      { label: "cases", template: "cases(◻, ◻)", title: "Cases / piecewise" },
      { label: "matrix", template: "mat(◻, ◻; ◻, ◻)", title: "Matrix 2x2" },
      { label: "v⃗", template: "arrow(◻)", title: "Vector arrow" },
      { label: "x̂", template: "hat(◻)", title: "Hat" },
      { label: "x̄", template: "macron(◻)", title: "Bar" },
      { label: "ẋ", template: "dot(◻)", title: "Dot accent" },
    ],
  },
];

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Typst could not compile this equation.";
}

export function EquationPanel({
  onInsert,
  editingTypst,
  onClose,
  visible,
  isDark = false,
  renderEquation = renderTypstToSvg,
}: EquationPanelProps) {
  const [source, setSource] = useState(editingTypst ?? "");
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [preview, setPreview] = useState<(RenderResult & { source: string }) | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "compiling" | "ready" | "error">("idle");
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewSequenceRef = useRef(0);
  const t = useMemo(() => getTheme(isDark), [isDark]);

  useEffect(() => {
    if (editingTypst !== undefined && editingTypst !== null) {
      setSource(editingTypst);
      setShowLibrary(false);
    }
  }, [editingTypst]);

  useEffect(() => {
    const request = ++previewSequenceRef.current;
    if (!source.trim()) {
      setPreview(null);
      setCompileError(null);
      setPreviewStatus("idle");
      return;
    }

    setPreview(null);
    setCompileError(null);
    setPreviewStatus("compiling");
    const timer = window.setTimeout(() => {
      void renderEquation(source, { latestOnly: true })
        .then((result) => {
          if (previewSequenceRef.current !== request) return;
          setPreview({ ...result, source });
          setPreviewStatus("ready");
        })
        .catch((error: unknown) => {
          if (previewSequenceRef.current !== request || error instanceof TypstRenderSupersededError) return;
          setCompileError(messageFor(error));
          setPreviewStatus("error");
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [renderEquation, source]);

  const categories = useMemo(() => getCategories(), []);
  const filteredExpressions = useMemo(
    () => filterExpressions(selectedCategory || undefined, searchTerm || undefined),
    [selectedCategory, searchTerm],
  );

  const insertAtCursor = useCallback((template: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setSource((current) => current + template.replace(/◻/g, ""));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = source.substring(start, end);
    let insert = selected ? template.replace("◻", selected) : template;
    const cursorPlaceholder = insert.indexOf("◻");
    insert = insert.replace(/◻/g, "");
    setSource(source.substring(0, start) + insert + source.substring(end));
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = cursorPlaceholder >= 0 ? start + cursorPlaceholder : start + insert.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [source]);

  const handleInsert = useCallback(async () => {
    if (!source.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setCompileError(null);
    try {
      const result = preview?.source === source ? preview : await renderEquation(source);
      await onInsert(source, result.svg, result.width, result.height);
    } catch (error) {
      setCompileError(messageFor(error));
      setPreviewStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onInsert, preview, renderEquation, source]);

  const handleExpressionClick = useCallback((entry: ExpressionEntry) => {
    setSource(entry.typst);
    setShowLibrary(false);
  }, []);

  if (!visible) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "9px 12px",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    color: active ? t.accent : t.textMuted,
    borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: t.text }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}` }}>
        <button type="button" onClick={() => setShowLibrary(false)} style={tabStyle(!showLibrary)}>
          Editor
        </button>
        <button type="button" onClick={() => setShowLibrary(true)} style={tabStyle(showLibrary)}>
          Library ({expressionLibrary.length})
        </button>
      </div>

      {showLibrary ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: `1px solid ${t.borderLight}` }}>
            <input
              type="text"
              placeholder="Search Typst expressions..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              style={{ flex: 1, padding: "7px 10px", border: `1px solid ${t.border}`, borderRadius: 6, background: t.bgInput, color: t.text }}
            />
            <select
              aria-label="Filter by category"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              style={{ padding: "7px 8px", border: `1px solid ${t.border}`, borderRadius: 6, background: t.bgInput, color: t.text }}
            >
              <option value="">All</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
            {filteredExpressions.map((entry) => (
              <button
                type="button"
                key={`${entry.category}:${entry.label}`}
                onClick={() => handleExpressionClick(entry)}
                title={entry.typst}
                style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", padding: "8px 10px", border: "none", borderRadius: 6, background: "none", color: t.text, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 12 }}>{entry.label}</span>
                <code style={{ fontSize: 10, color: t.textFaint }}>{entry.typst}</code>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {toolbarGroups.map((group) => (
              <div key={group.name}>
                <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{group.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {group.buttons.map((button) => (
                    <button
                      type="button"
                      key={`${group.name}:${button.title}`}
                      onClick={() => insertAtCursor(button.template)}
                      title={button.title}
                      style={{ padding: "4px 7px", border: `1px solid ${t.borderLight}`, borderRadius: 4, background: t.bgElevated, color: t.text, cursor: "pointer", fontSize: 12, minWidth: 28, lineHeight: 1.4 }}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <label htmlFor="excalimath-typst-source" style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Typst math
          </label>
          <textarea
            id="excalimath-typst-source"
            ref={textareaRef}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="frac(-b plus.minus sqrt(b^2 - 4 a c), 2 a)"
            spellCheck={false}
            style={{ minHeight: 76, resize: "vertical", padding: "10px", border: `1px solid ${compileError ? t.error : t.border}`, borderRadius: 6, background: t.bgInput, color: t.text, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 13, lineHeight: 1.5 }}
          />

          <div aria-live="polite" style={{ minHeight: 90, padding: 10, border: `1px solid ${t.borderLight}`, borderRadius: 6, background: t.bgElevated, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
            {previewStatus === "compiling" && <span style={{ fontSize: 11, color: t.textMuted }}>Compiling Typst…</span>}
            {previewStatus === "idle" && <span style={{ fontSize: 11, color: t.textFaint }}>Preview</span>}
            {previewStatus === "error" && <span role="alert" style={{ fontSize: 11, color: t.error }}>{compileError}</span>}
            {previewStatus === "ready" && preview && (
              <div
                data-testid="typst-equation-preview"
                style={{ lineHeight: 0, maxWidth: "100%" }}
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "auto" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", border: `1px solid ${t.border}`, borderRadius: 6, background: t.bg, color: t.text, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleInsert()}
              disabled={!source.trim() || isSubmitting}
              style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: t.accent, color: t.accentText, cursor: !source.trim() || isSubmitting ? "default" : "pointer", opacity: !source.trim() || isSubmitting ? 0.5 : 1, fontWeight: 600 }}
            >
              {isSubmitting ? "Compiling…" : editingTypst !== null && editingTypst !== undefined ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
