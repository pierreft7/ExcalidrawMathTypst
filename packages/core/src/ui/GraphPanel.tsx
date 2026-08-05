/**
 * @module GraphPanel
 *
 * Function graph plotter panel with multi-function support, axis config,
 * CSV data import, templates, zoom insets, and a live Typst simple-plot
 * preview. Embedded inside the ExcaliMath sidebar.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { validateExpression } from "../plugins/graph/evaluator";
import { renderGraphToSvg, parseCsvData } from "../plugins/graph/plotRenderer";
import { plotTemplates } from "../plugins/graph/templates";
import {
  TRACE_COLORS,
  createDefaultGraphConfig,
  type GraphConfig,
  type FunctionTrace,
  type DataTrace,
  type LabelSide,
  type ZoomSpec,
  type ZoomAt,
} from "../plugins/graph/types";
import { getTheme } from "./theme";

export interface GraphPanelProps {
  onInsert: (config: GraphConfig, svg: string, width: number, height: number) => void;
  editingConfig?: GraphConfig | null;
  onClose: () => void;
  visible: boolean;
  isDark?: boolean;
}

type Tab = "functions" | "data" | "templates";

const LABEL_SIDES: LabelSide[] = [
  "above", "below", "left", "right",
  "above-left", "above-right", "below-left", "below-right",
];

const MARK_TYPES = [
  "o", "*", "square", "square*", "triangle", "triangle*",
  "diamond", "diamond*", "star", "x", "+", "none",
];

const ZOOM_AT_PRESETS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

/** Convert legacy zoom specs (region corners + at) to center + size in cm. */
function normalizeZoomSpec(
  zoom: ZoomSpec | null | undefined,
  axis: { xMin: number; xMax: number },
  width: number
): ZoomSpec | null {
  if (!zoom) return null;
  const legacy = zoom as ZoomSpec & { region?: [number, number, number, number] };
  if (legacy.region != null && (legacy.center == null || legacy.size == null)) {
    const [x1, y1, x2, y2] = legacy.region;
    const plotWidthCm = (width * 0.75) / 28.35;
    const size = Math.max(0.05, ((x2 - x1) * plotWidthCm) / (axis.xMax - axis.xMin));
    return {
      ...zoom,
      center: [(x1 + x2) / 2, (y1 + y2) / 2],
      size,
      at: zoom.at ?? "bottom-right",
    };
  }
  return zoom;
}

/** Inline colour selector: preset swatches + a native picker for custom colours. */
function ColorControl({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (color: string) => void;
  t: ReturnType<typeof getTheme>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {TRACE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: 16, height: 16, borderRadius: "50%", padding: 0, cursor: "pointer",
            backgroundColor: c, flexShrink: 0,
            border: value === c ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
          }}
        />
      ))}
      <label
        title="Custom colour"
        style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
          backgroundColor: value, border: `1px solid ${t.border}`, position: "relative",
          display: "inline-flex",
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
        />
      </label>
    </div>
  );
}

export function GraphPanel({
  onInsert,
  editingConfig,
  onClose,
  visible,
  isDark = false,
}: GraphPanelProps) {
  const [config, setConfig] = useState<GraphConfig>(
    editingConfig ?? createDefaultGraphConfig()
  );
  const [activeTab, setActiveTab] = useState<Tab>("functions");
  const [csvText, setCsvText] = useState("");
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [previewSvg, setPreviewSvg] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [expandedFn, setExpandedFn] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => getTheme(isDark), [isDark]);

  useEffect(() => {
    if (editingConfig) {
      setConfig({
        ...editingConfig,
        zoom: normalizeZoomSpec(editingConfig.zoom, editingConfig.axis, editingConfig.width),
      });
      setActiveTab("functions");
    }
  }, [editingConfig]);

  useEffect(() => {
    const newErrors: Record<number, string> = {};
    config.functions.forEach((fn, i) => {
      if (fn.expression.trim()) {
        const err = validateExpression(fn.expression);
        if (err) newErrors[i] = err;
      }
    });
    setErrors(newErrors);
  }, [config.functions]);

  // Auto-preview with debounce
  useEffect(() => {
    const hasValidFunctions = config.functions.some(
      (fn) => fn.expression.trim() && !validateExpression(fn.expression)
    );
    const hasData = config.dataTraces.length > 0;
    if (!hasValidFunctions && !hasData) {
      setPreviewSvg("");
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setRendering(true);
        setRenderError("");
        const result = await renderGraphToSvg(config, { latestOnly: true });
        setPreviewSvg(result.svg.replace("<svg", '<svg style="max-width:100%;height:auto"'));
      } catch (err) {
        if (!(err instanceof Error && err.name === "TypstRenderSupersededError")) {
          setRenderError(err instanceof Error ? err.message : "Render failed");
          setPreviewSvg("");
        }
      } finally {
        setRendering(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [config]);

  const updateFunction = useCallback((index: number, updates: Partial<FunctionTrace>) => {
    setConfig((prev) => ({
      ...prev,
      functions: prev.functions.map((fn, i) =>
        i === index ? { ...fn, ...updates } : fn
      ),
    }));
  }, []);

  const addFunction = useCallback(() => {
    setConfig((prev) => {
      if (prev.functions.length >= 5) return prev;
      return {
        ...prev,
        functions: [
          ...prev.functions,
          { expression: "", color: TRACE_COLORS[prev.functions.length % TRACE_COLORS.length] },
        ],
      };
    });
  }, []);

  const removeFunction = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      functions: prev.functions.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAxisChange = useCallback(
    (field: string, value: string | boolean) => {
      setConfig((prev) => ({
        ...prev,
        axis: {
          ...prev.axis,
          [field]: typeof value === "boolean" ? value : parseFloat(value as string) || 0,
        },
      }));
    }, []
  );

  const handleAxisLabelChange = useCallback(
    (field: "xLabel" | "yLabel", value: string) => {
      setConfig((prev) => ({ ...prev, axis: { ...prev.axis, [field]: value } }));
    }, []
  );

  /** Update a numeric axis field; an empty string clears the value. */
  const handleAxisNumberChange = useCallback(
    (field: "xTickStep" | "yTickStep" | "tickLabelSize", value: string) => {
      setConfig((prev) => ({
        ...prev,
        axis: {
          ...prev.axis,
          [field]: value.trim() === "" ? undefined : (parseFloat(value) || 0),
        },
      }));
    }, []
  );

  const handleAxisSelectChange = useCallback(
    (field: "axisXPos" | "axisYPos", value: string) => {
      setConfig((prev) => ({
        ...prev,
        axis: {
          ...prev.axis,
          [field]: value === "auto" ? undefined : value,
        },
      }));
    }, []
  );

  const updateZoom = useCallback((updates: Partial<ZoomSpec>) => {
    setConfig((prev) => {
      const base: ZoomSpec = prev.zoom ?? {
        center: [0, 0],
        size: 0.6,
        magnification: 3,
        at: "bottom-right",
        lensShape: "rect",
        showInsetGrid: true,
      };
      return { ...prev, zoom: { ...base, ...updates } };
    });
  }, []);

  const removeZoom = useCallback(() => {
    setConfig((prev) => ({ ...prev, zoom: null }));
  }, []);

  const handleAddCsvData = useCallback(() => {
    try {
      const { xValues, yValues } = parseCsvData(csvText);
      const newTrace: DataTrace = {
        xValues, yValues, mode: "scatter",
        color: TRACE_COLORS[config.dataTraces.length % TRACE_COLORS.length],
        label: `Data ${config.dataTraces.length + 1}`,
      };
      setConfig((prev) => ({ ...prev, dataTraces: [...prev.dataTraces, newTrace] }));
      setCsvText("");
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : "Invalid CSV data");
    }
  }, [csvText, config.dataTraces.length]);

  const removeDataTrace = useCallback((index: number) => {
    setConfig((prev) => ({ ...prev, dataTraces: prev.dataTraces.filter((_, i) => i !== index) }));
  }, []);

  const updateDataTrace = useCallback((index: number, updates: Partial<DataTrace>) => {
    setConfig((prev) => ({
      ...prev,
      dataTraces: prev.dataTraces.map((dt, i) =>
        i === index ? { ...dt, ...updates } : dt
      ),
    }));
  }, []);

  const handleTemplateClick = useCallback((template: typeof plotTemplates[0]) => {
    setConfig(structuredClone(template.config));
    setActiveTab("functions");
  }, []);

  const handleInsert = useCallback(async () => {
    try {
      setRendering(true);
      const result = await renderGraphToSvg(config);
      onInsert(config, result.svg, result.width, result.height);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : "Failed to render graph");
    } finally {
      setRendering(false);
    }
  }, [config, onInsert]);

  const hasValidContent =
    config.functions.some((fn, i) => fn.expression.trim() && !errors[i]) ||
    config.dataTraces.length > 0;

  if (!visible) return null;

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "8px 8px", border: "none", background: "none",
    cursor: "pointer", fontSize: 11, fontWeight: 500,
    color: active ? t.accent : t.textMuted,
    borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
    transition: "all 0.15s",
  });

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", border: `1px solid ${t.border}`, borderRadius: 5,
    fontSize: 12, outline: "none", backgroundColor: t.bgInput, color: t.text, width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: t.textMuted,
    textTransform: "uppercase", letterSpacing: "0.5px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: t.text }}>
      {/* Sub-tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}` }}>
        {(["functions", "data", "templates"] as Tab[]).map((tab) => (
          <button type="button" key={tab} onClick={() => setActiveTab(tab)} style={subTabStyle(activeTab === tab)}>
            {tab === "functions" ? "Functions" : tab === "data" ? "Data" : `Templates (${plotTemplates.length})`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {/* Functions tab */}
        {activeTab === "functions" && (
          <>
            {config.functions.map((fn, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedFn(expandedFn === i ? null : i)}
                    title={expandedFn === i ? "Collapse options" : "Function options"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: t.textFaint, fontSize: 10, padding: "2px 0", width: 14, flexShrink: 0 }}
                  >
                    {expandedFn === i ? "▾" : "▸"}
                  </button>
                  <label
                    title="Change colour"
                    style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: fn.color, flexShrink: 0, cursor: "pointer", position: "relative", border: `1px solid ${t.borderLight}` }}
                  >
                    <input
                      type="color"
                      value={fn.color}
                      onChange={(e) => updateFunction(i, { color: e.target.value })}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                    />
                  </label>
                  <input
                    type="text" value={fn.expression}
                    onChange={(e) => updateFunction(i, { expression: e.target.value })}
                    placeholder="e.g. sin(x), x^2 + 2*x"
                    spellCheck={false}
                    style={{
                      ...inputStyle, flex: 1,
                      fontFamily: '"Fira Code", "Cascadia Code", monospace',
                      borderColor: errors[i] ? t.error : t.border,
                    }}
                  />
                  {config.functions.length > 1 && (
                    <button type="button" onClick={() => removeFunction(i)}
                      style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: t.textFaint, padding: "2px 4px" }}>
                      ×
                    </button>
                  )}
                </div>
                {errors[i] && <div style={{ width: "100%", paddingLeft: 22, fontSize: 10, color: t.error }}>{errors[i]}</div>}
                {expandedFn === i && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", marginLeft: 14, border: `1px solid ${t.borderLight}`, borderRadius: 6, backgroundColor: t.bgElevated }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, color: t.textFaint }}>Label (drawn on the curve)</span>
                      <input
                        type="text" value={fn.label ?? ""}
                        onChange={(e) => updateFunction(i, { label: e.target.value })}
                        placeholder="e.g. y = x² (empty = expression)"
                        spellCheck={false}
                        style={{ ...inputStyle, fontSize: 11 }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: t.textFaint, flexShrink: 0 }}>Colour</span>
                      <ColorControl value={fn.color} onChange={(color) => updateFunction(i, { color })} t={t} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Label position (0–1)</span>
                        <input
                          type="number" min={0} max={1} step={0.05}
                          value={fn.labelPos ?? ""}
                          placeholder="auto"
                          onChange={(e) => updateFunction(i, { labelPos: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Label side</span>
                        <select
                          value={fn.labelSide ?? ""}
                          onChange={(e) => updateFunction(i, { labelSide: (e.target.value || undefined) as LabelSide | undefined })}
                          style={inputStyle}
                        >
                          <option value="">Auto</option>
                          {LABEL_SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Stroke width (pt)</span>
                        <input
                          type="number" min={0.2} step={0.1}
                          value={fn.strokeWidth ?? ""}
                          placeholder="1.2"
                          onChange={(e) => updateFunction(i, { strokeWidth: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Samples</span>
                        <input
                          type="number" min={10} max={2000} step={10}
                          value={fn.samples ?? ""}
                          placeholder="auto"
                          onChange={(e) => updateFunction(i, { samples: e.target.value === "" ? undefined : parseInt(e.target.value, 10) })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Domain min (optional)</span>
                        <input
                          type="number"
                          value={fn.domainMin ?? ""}
                          placeholder="auto"
                          onChange={(e) => updateFunction(i, { domainMin: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: t.textFaint }}>Domain max (optional)</span>
                        <input
                          type="number"
                          value={fn.domainMax ?? ""}
                          placeholder="auto"
                          onChange={(e) => updateFunction(i, { domainMax: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textMuted, cursor: "pointer" }}>
                      <input type="checkbox" checked={fn.dash ?? false} onChange={(e) => updateFunction(i, { dash: e.target.checked })} />
                      Dashed line
                    </label>
                  </div>
                )}
              </div>
            ))}
            {config.functions.length < 5 && (
              <button type="button" onClick={addFunction}
                style={{ padding: "7px 10px", border: `1px dashed ${t.border}`, borderRadius: 6, background: "none", cursor: "pointer", fontSize: 12, color: t.accent, fontWeight: 500 }}>
                + Add function
              </button>
            )}

            {/* Axis config */}
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
              <label style={labelStyle}>Axis Settings</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {([["xMin", "X min"], ["xMax", "X max"], ["yMin", "Y min"], ["yMax", "Y max"]] as const).map(([field, label]) => (
                  <div key={field} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: t.textFaint }}>{label}</span>
                    <input type="number" value={config.axis[field]} onChange={(e) => handleAxisChange(field, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>X label</span>
                  <input type="text" value={config.axis.xLabel} onChange={(e) => handleAxisLabelChange("xLabel", e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>Y label</span>
                  <input type="text" value={config.axis.yLabel} onChange={(e) => handleAxisLabelChange("yLabel", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer" }}>
                <input type="checkbox" checked={config.axis.showGrid} onChange={(e) => handleAxisChange("showGrid", e.target.checked)} />
                Show grid
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer" }}>
                <input type="checkbox" checked={config.axis.showMinorGrid ?? false} onChange={(e) => handleAxisChange("showMinorGrid", e.target.checked)} />
                Minor grid lines
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>X axis position</span>
                  <select
                    value={config.axis.axisXPos ?? "auto"}
                    onChange={(e) => handleAxisSelectChange("axisXPos", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="auto">Auto (cross at y=0)</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                    <option value="none">Hidden</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>Y axis position</span>
                  <select
                    value={config.axis.axisYPos ?? "auto"}
                    onChange={(e) => handleAxisSelectChange("axisYPos", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="auto">Auto (cross at x=0)</option>
                    <option value="center">Center</option>
                    <option value="left">Left</option>
                    <option value="none">Hidden</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>X tick step (auto)</span>
                  <input type="number" min={0.1} step={0.5} value={config.axis.xTickStep ?? config.axis.tickInterval ?? ""} onChange={(e) => handleAxisNumberChange("xTickStep", e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: t.textFaint }}>Y tick step (auto)</span>
                  <input type="number" min={0.1} step={0.5} value={config.axis.yTickStep ?? config.axis.tickInterval ?? ""} onChange={(e) => handleAxisNumberChange("yTickStep", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer" }}>
                  <input type="checkbox" checked={config.axis.showOrigin ?? true} onChange={(e) => handleAxisChange("showOrigin", e.target.checked)} />
                  Origin label
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer" }}>
                  <input type="checkbox" checked={config.axis.showEndTicks ?? true} onChange={(e) => handleAxisChange("showEndTicks", e.target.checked)} />
                  End ticks
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: "50%" }}>
                <span style={{ fontSize: 10, color: t.textFaint }}>Tick label size (pt, auto)</span>
                <input type="number" min={4} max={20} step={0.5} value={config.axis.tickLabelSize ?? ""} onChange={(e) => handleAxisNumberChange("tickLabelSize", e.target.value)} style={inputStyle} />
              </div>

              {/* Background colour */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <label style={{ ...labelStyle, margin: 0, flexShrink: 0 }}>Background</label>
                <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
                  {[
                    { value: "transparent", label: "None" },
                    { value: "#ffffff", label: "" },
                    { value: "#f8f9fa", label: "" },
                    { value: "#1e1e1e", label: "" },
                    { value: "#fff9db", label: "" },
                    { value: "#e7f5ff", label: "" },
                    { value: "#ebfbee", label: "" },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setConfig((prev) => ({ ...prev, backgroundColor: opt.value }))}
                      title={opt.value === "transparent" ? "Transparent" : opt.value}
                      style={{
                        width: opt.label === "None" ? "auto" : 22,
                        height: 22,
                        padding: opt.label === "None" ? "0 8px" : 0,
                        borderRadius: 4,
                        border: config.backgroundColor === opt.value
                          ? `2px solid ${t.accent}`
                          : `1px solid ${t.border}`,
                        backgroundColor: opt.value === "transparent" ? t.bgInput : opt.value,
                        cursor: "pointer",
                        fontSize: 9,
                        color: t.textMuted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {opt.label === "None" ? "None" : opt.value === "transparent" ? "⊘" : ""}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={config.backgroundColor === "transparent" ? "#ffffff" : config.backgroundColor}
                    onChange={(e) => setConfig((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                    title="Custom colour"
                    style={{
                      width: 22, height: 22, padding: 0, border: `1px solid ${t.border}`,
                      borderRadius: 4, cursor: "pointer", backgroundColor: "transparent",
                    }}
                  />
                </div>
              </div>

              {/* Zoom inset */}
              <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!config.zoom}
                    onChange={(e) => (e.target.checked ? updateZoom({}) : removeZoom())}
                  />
                  Zoom inset (spy glass)
                </label>
                {config.zoom && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {(() => {
                      const zoom = config.zoom;
                      const atIsCustom = Array.isArray(zoom.at);
                      const atPreset: string = atIsCustom
                        ? "custom"
                        : typeof zoom.at === "string" ? zoom.at : "auto";
                      const atTuple: [number, number] = atIsCustom
                        ? (zoom.at as [number, number])
                        : [0, 0];
                      return (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Center X</span>
                              <input
                                type="number" step="any"
                                value={zoom.center[0]}
                                onChange={(e) => updateZoom({ center: [parseFloat(e.target.value) || 0, zoom.center[1]] })}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Center Y</span>
                              <input
                                type="number" step="any"
                                value={zoom.center[1]}
                                onChange={(e) => updateZoom({ center: [zoom.center[0], parseFloat(e.target.value) || 0] })}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Size (cm)</span>
                              <input
                                type="number" min={0.05} step={0.1}
                                value={zoom.size}
                                onChange={(e) => updateZoom({ size: parseFloat(e.target.value) || 0.6 })}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Magnification</span>
                              <input
                                type="number" min={1.5} max={10} step={0.5}
                                value={zoom.magnification ?? 3}
                                onChange={(e) => updateZoom({ magnification: parseFloat(e.target.value) || 3 })}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 10, color: t.textFaint }}>Inset placement</span>
                            <select
                              value={atPreset}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateZoom({ at: value === "custom" ? [0, 0] : (value as ZoomAt) });
                              }}
                              style={inputStyle}
                            >
                              {ZOOM_AT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                              <option value="custom">Custom (x, y)</option>
                            </select>
                          </div>
                          {atIsCustom && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 10, color: t.textFaint }}>Inset x</span>
                                <input
                                  type="number" step="any"
                                  value={atTuple[0]}
                                  onChange={(e) => updateZoom({ at: [parseFloat(e.target.value) || 0, atTuple[1]] })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 10, color: t.textFaint }}>Inset y</span>
                                <input
                                  type="number" step="any"
                                  value={atTuple[1]}
                                  onChange={(e) => updateZoom({ at: [atTuple[0], parseFloat(e.target.value) || 0] })}
                                  style={inputStyle}
                                />
                              </div>
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Lens shape</span>
                              <select
                                value={zoom.lensShape ?? "rect"}
                                onChange={(e) => updateZoom({ lensShape: e.target.value as "rect" | "circle" })}
                                style={inputStyle}
                              >
                                <option value="rect">Rectangle</option>
                                <option value="circle">Circle</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMuted, cursor: "pointer", flex: 1 }}>
                              <input type="checkbox" checked={zoom.showInsetGrid ?? true} onChange={(e) => updateZoom({ showInsetGrid: e.target.checked })} />
                              Inset grid
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, color: t.textFaint }}>Accent</span>
                              <input
                                type="color"
                                value={zoom.accent ?? "#4a90d9"}
                                onChange={(e) => updateZoom({ accent: e.target.value })}
                                style={{ width: 24, height: 24, padding: 0, border: `1px solid ${t.border}`, borderRadius: 4, cursor: "pointer", backgroundColor: "transparent" }}
                              />
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Data tab */}
        {activeTab === "data" && (
          <>
            <label style={labelStyle}>Paste CSV Data (x, y)</label>
            <textarea
              value={csvText} onChange={(e) => setCsvText(e.target.value)}
              placeholder={"x, y\n1, 2\n2, 4\n3, 1\n4, 7"} rows={5} spellCheck={false}
              style={{
                ...inputStyle, fontFamily: '"Fira Code", "Cascadia Code", monospace',
                resize: "vertical", lineHeight: 1.5,
              }}
            />
            <button type="button" onClick={handleAddCsvData} disabled={!csvText.trim()}
              style={{
                padding: "7px 10px", border: `1px dashed ${t.border}`, borderRadius: 6,
                background: "none", cursor: csvText.trim() ? "pointer" : "not-allowed",
                fontSize: 12, color: t.accent, fontWeight: 500, opacity: csvText.trim() ? 1 : 0.5,
              }}>
              + Add data trace
            </button>
            {config.dataTraces.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label style={labelStyle}>Data Traces</label>
                {config.dataTraces.map((dt, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", borderBottom: `1px solid ${t.borderLight}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <label
                        title="Change colour"
                        style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: dt.color, flexShrink: 0, cursor: "pointer", position: "relative", border: `1px solid ${t.borderLight}` }}
                      >
                        <input
                          type="color"
                          value={dt.color}
                          onChange={(e) => updateDataTrace(i, { color: e.target.value })}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                        />
                      </label>
                      <span style={{ flex: 1, fontSize: 12, color: t.text }}>
                        {dt.label} ({dt.xValues.length} pts)
                      </span>
                      <button type="button" onClick={() => removeDataTrace(i)}
                        style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: t.textFaint }}>
                        ×
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        value={dt.mode}
                        onChange={(e) => updateDataTrace(i, { mode: e.target.value as DataTrace["mode"] })}
                        style={{ ...inputStyle, width: "auto", fontSize: 11 }}
                      >
                        <option value="scatter">Scatter</option>
                        <option value="line">Line</option>
                      </select>
                      <select
                        value={dt.mark ?? (dt.mode === "line" ? "none" : "o")}
                        onChange={(e) => updateDataTrace(i, { mark: e.target.value })}
                        style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                      >
                        {MARK_TYPES.map((m) => <option key={m} value={m}>{m === "none" ? "No marker" : `Marker ${m}`}</option>)}
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t.textMuted }}>
                        Label
                        <input
                          type="text" value={dt.label ?? ""} placeholder={`Data ${i + 1}`}
                          onChange={(e) => updateDataTrace(i, { label: e.target.value })}
                          style={{ ...inputStyle, width: 90, fontSize: 11, padding: "5px 8px" }}
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: t.textFaint, flexShrink: 0 }}>Colour</span>
                      <ColorControl value={dt.color} onChange={(color) => updateDataTrace(i, { color })} t={t} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Templates tab */}
        {activeTab === "templates" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {plotTemplates.map((tpl, i) => (
              <button type="button" key={i} onClick={() => handleTemplateClick(tpl)}
                style={{
                  display: "flex", flexDirection: "column", gap: 3, padding: "12px 10px",
                  border: `1px solid ${t.borderLight}`, borderRadius: 8,
                  background: t.bgElevated, cursor: "pointer", textAlign: "left",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.borderLight)}>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{tpl.name}</span>
                <span style={{ fontSize: 11, color: t.textFaint }}>{tpl.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Preview */}
        {previewSvg && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            <label style={labelStyle}>Preview</label>
            <div
              ref={previewRef}
              style={{
                backgroundColor: t.bgElevated, borderRadius: 6,
                border: `1px solid ${t.borderLight}`, overflow: "hidden",
                display: "flex", justifyContent: "center",
              }}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>
        )}

        {rendering && <div style={{ fontSize: 12, color: t.textFaint, textAlign: "center", padding: 6 }}>Rendering...</div>}
        {renderError && (
          <div style={{ padding: "8px 10px", backgroundColor: t.errorBg, borderRadius: 6, color: t.error, fontSize: 12 }}>
            {renderError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, paddingTop: 4, marginTop: "auto" }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: "9px 14px", border: `1px solid ${t.border}`, borderRadius: 6, background: t.bg, cursor: "pointer", fontSize: 13, fontWeight: 500, color: t.textMuted }}>
            Cancel
          </button>
          <button type="button" onClick={handleInsert} disabled={!hasValidContent || rendering}
            style={{
              flex: 1, padding: "9px 14px", border: "none", borderRadius: 6,
              backgroundColor: t.accent, color: t.accentText, cursor: "pointer",
              fontSize: 13, fontWeight: 600, opacity: !hasValidContent || rendering ? 0.5 : 1,
            }}>
            {rendering ? "Rendering..." : editingConfig ? "Update" : "Insert"}
          </button>
        </div>
      </div>
    </div>
  );
}
