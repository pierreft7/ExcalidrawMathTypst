/**
 * @module ExcaliMath
 *
 * Main wrapper component for the ExcaliMath plugin. Provides:
 * - Single toolbar icon that toggles a sidebar with tabbed navigation
 * - Theme-aware rendering (reads Excalidraw's light/dark mode)
 * - Clean component API: theme, initialData, onSave, enabledPlugins
 * - Round-trip fidelity: restores equations/graphs from saved files
 */

import { useState, useCallback, useRef, useMemo, useEffect, memo } from "react";
import { EquationPanel } from "./EquationPanel";
import { GraphPanel } from "./GraphPanel";
import { LibraryPanel } from "./LibraryPanel";
import { PresentationMode, SlidesPanel } from "./SlidesPanel";
import { createImageElement } from "../core/elementFactory";
import { getSelectedExcalimathElement } from "../core/stateBridge";
import { restoreExcalimathFilesAsync, extractExcalimathData } from "../core/roundTrip";
import { shapeToExcalidrawElements } from "../plugins/geometry/registry";
import { applySlideOrder, getSlides, sameSlideDeck, type SlideFrame } from "../plugins/slides";
import { getTheme } from "./theme";
import type { ExcalimathMetadata } from "../core/types";
import type { GraphConfig } from "../plugins/graph/types";
import type { LibraryShape } from "../plugins/geometry/types";
import type { EquationRenderer } from "../plugins/equation/renderer";

export type ActiveTab = "equation" | "graph" | "library" | "slides" | null;

/** Detects if the user is in an active drawing, dragging, or resizing gesture */
function isUserInteracting(appState: any): boolean {
  if (!appState) return false;
  return Boolean(
    appState.cursorButton === "down" ||
    appState.newElement != null ||
    appState.selectedElementsAreBeingDragged ||
    appState.resizingElement != null ||
    appState.editingLinearElement != null
  );
}

/** Serialisable scene data for save/load */
export interface ExcalimathSceneData {
  elements: any[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface ExcaliMathProps {
  /** The Excalidraw API ref, obtained from excalidrawAPI callback */
  excalidrawAPI: any;

  /** Which plugins to enable (defaults to all) */
  enabledPlugins?: Array<"equation" | "graph" | "library" | "slides">;

  /** Override theme: "light" | "dark" | "auto" (auto reads from Excalidraw) */
  theme?: "light" | "dark" | "auto";

  /**
   * Initial scene data to load. When provided, ExcaliMath will restore
   * any equations and graphs by regenerating their SVG files from metadata.
   */
  initialData?: ExcalimathSceneData;

  /**
   * Called whenever the scene changes with an ExcaliMath action (insert,
   * update, delete). Receives the full scene data for persistence.
   */
  onSave?: (data: ExcalimathSceneData) => void;

  /** Reuse a host application's Typst pipeline instead of the built-in worker. */
  renderEquation?: EquationRenderer;
}

export const ExcaliMath = memo(function ExcaliMath({
  excalidrawAPI,
  enabledPlugins = ["equation", "graph", "library", "slides"],
  theme = "auto",
  initialData,
  onSave,
  renderEquation,
}: ExcaliMathProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  const [editingTypst, setEditingTypst] = useState<string | null>(null);
  const [editingGraphConfig, setEditingGraphConfig] = useState<GraphConfig | null>(null);
  const [presentationFrameId, setPresentationFrameId] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideFrame[]>(() =>
    getSlides(excalidrawAPI?.getSceneElements?.() ?? []),
  );
  const slidesRef = useRef<SlideFrame[]>(slides);
  const editingElementIdRef = useRef<string | null>(null);
  const lastSelectedElementIdRef = useRef<string | null>(null);

  const activeTabRef = useRef<ActiveTab>(activeTab);
  activeTabRef.current = activeTab;
  const presentationFrameIdRef = useRef<string | null>(presentationFrameId);
  presentationFrameIdRef.current = presentationFrameId;

  // ── Theme resolution ──
  const excalidrawTheme = excalidrawAPI?.getAppState?.()?.theme;
  const isDark = theme === "auto"
    ? excalidrawTheme === "dark"
    : theme === "dark";
  const t = useMemo(() => getTheme(isDark), [isDark]);

  const equationEnabled = enabledPlugins.includes("equation");
  const graphEnabled = enabledPlugins.includes("graph");
  const libraryEnabled = enabledPlugins.includes("library");
  const slidesEnabled = enabledPlugins.includes("slides");
  const isOpen = activeTab !== null;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useEffect(() => {
    if (!excalidrawAPI) return;
    const updateSlides = (elements: readonly unknown[], appState?: any) => {
      // Never scan elements or dispatch state while drawing a stroke
      if (isUserInteracting(appState)) return;
      // If slides panel is not open and not presenting, avoid processing slides
      if (activeTabRef.current !== "slides" && !presentationFrameIdRef.current) return;

      const next = getSlides(elements);
      setSlides((previous) => sameSlideDeck(previous, next) ? previous : next);
    };
    updateSlides(excalidrawAPI.getSceneElements());
    return excalidrawAPI.onChange(updateSlides);
  }, [excalidrawAPI]);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  // ── Click-to-edit: follow the current selection ──
  // When a single ExcaliMath element is selected, point the editor at it so
  // "Update" replaces it in place instead of inserting a duplicate. Without
  // this, selecting an element while the panel is already open would leave
  // the panel in insert mode.
  useEffect(() => {
    if (!excalidrawAPI) return;
    const followSelection = (elements: readonly any[], appState: any) => {
      // Never recompute selection while drawing a stroke
      if (isUserInteracting(appState)) return;
      if (!isOpenRef.current) return;

      const selectedIds = appState?.selectedElementIds || {};
      const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
      const selectedId = ids.length === 1 ? ids[0] : null;

      if (selectedId === lastSelectedElementIdRef.current) return;
      lastSelectedElementIdRef.current = selectedId;

      const selected = selectedId
        ? elements.find((el: any) => el.id === selectedId)
        : null;
      const meta = selected?.customData as ExcalimathMetadata | undefined;

      if (
        graphEnabled &&
        meta?.excalimath_type === "graph" &&
        meta.excalimath_graph_config
      ) {
        try {
          const parsed = JSON.parse(meta.excalimath_graph_config);
          editingElementIdRef.current = selectedId;
          setEditingGraphConfig(parsed);
          if (isOpenRef.current) setActiveTab("graph");
          return;
        } catch {
          /* malformed config — fall through and detach */
        }
      } else if (
        equationEnabled &&
        meta?.excalimath_type === "equation" &&
        meta.excalimath_typst
      ) {
        editingElementIdRef.current = selectedId;
        setEditingTypst(meta.excalimath_typst);
        if (isOpenRef.current) setActiveTab("equation");
        return;
      }

      // No (single) ExcaliMath element selected: detach the editor target.
      // Panel content is preserved — the button simply flips back to "Insert".
      editingElementIdRef.current = null;
      setEditingGraphConfig(null);
      setEditingTypst(null);
    };
    return excalidrawAPI.onChange(followSelection);
  }, [excalidrawAPI, graphEnabled, equationEnabled]);

  // ── Round-trip restore ──
  // Monitors scene elements and regenerates SVG files for any ExcaliMath
  // elements that are missing their file data (e.g. after opening a saved
  // .excalidraw file via Excalidraw's native open dialog).
  const restoringRef = useRef(false);
  const knownFileIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!excalidrawAPI) return;

    const checkAndRestore = async () => {
      if (restoringRef.current) return;
      const appState = excalidrawAPI.getAppState?.();
      if (isUserInteracting(appState)) return;

      const elements = excalidrawAPI.getSceneElements();
      const files = excalidrawAPI.getFiles?.() || {};

      // Find ExcaliMath image elements whose fileId is missing from files
      const needsRestore: typeof elements = [];
      for (const el of elements) {
        if (
          el.type === "image" &&
          el.fileId &&
          el.customData?.excalimath_type &&
          !files[el.fileId] &&
          !knownFileIdsRef.current.has(el.fileId)
        ) {
          needsRestore.push(el);
        }
      }

      if (needsRestore.length === 0) return;

      // Mark as restoring to prevent re-entry
      restoringRef.current = true;

      try {
        const restored = await restoreExcalimathFilesAsync(needsRestore);
        if (restored.length > 0) {
          excalidrawAPI.addFiles(restored);
          // Track restored IDs so we don't re-process them
          for (const f of restored) {
            knownFileIdsRef.current.add(f.id);
          }
        }
      } catch (err) {
        console.warn("[ExcaliMath] Failed to restore elements:", err);
      } finally {
        restoringRef.current = false;
      }
    };

    // Check periodically for missing files (handles native open dialog)
    checkAndRestore();
    const interval = setInterval(checkAndRestore, 4000);
    return () => clearInterval(interval);
  }, [excalidrawAPI]);

  // ── Load initial data if provided ──
  useEffect(() => {
    if (!excalidrawAPI || !initialData) return;

    if (initialData.elements?.length > 0) {
      excalidrawAPI.updateScene({ elements: initialData.elements });
      // The periodic check above will handle restoring files
    }
  }, [excalidrawAPI, initialData]);

  // ── Save helper ──
  const emitSave = useCallback(() => {
    if (!onSave || !excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles?.() || {};
    onSave({ elements, appState, files });
  }, [onSave, excalidrawAPI]);

  // ── Helpers ──

  const getSelectedElement = useCallback(() => {
    if (!excalidrawAPI) return null;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length !== 1) return null;

    const elements = excalidrawAPI.getSceneElements();
    const selected = elements.filter((el: any) => ids.includes(el.id));
    return getSelectedExcalimathElement(selected);
  }, [excalidrawAPI]);

  const upsertElement = useCallback(
    (svg: string, width: number, height: number, metadata: ExcalimathMetadata) => {
      if (!excalidrawAPI) return;

      if (editingElementIdRef.current) {
        const elements = excalidrawAPI.getSceneElements();
        const existing = elements.find(
          (el: any) => el.id === editingElementIdRef.current
        );
        const x = existing?.x ?? 100;
        const y = existing?.y ?? 100;

        // Use a fresh file ID, like the insert path. Reusing the old ID
        // would make Excalidraw's addFiles invalidate the cache of the
        // existing element and synchronously decode the (potentially large)
        // SVG inside the click handler — slow and crash-prone. With a new
        // ID the decode is deferred, and the orphaned old file is pruned by
        // Excalidraw at save time (filterOutDeletedFiles).
        const { element, fileEntry, fileId } = createImageElement({
          svg, width, height, metadata, x, y,
        });

        knownFileIdsRef.current.add(fileId);
        excalidrawAPI.addFiles([fileEntry]);

        // Replace in place, preserving the element's identity and any
        // grouping/framing/locking the user applied to it.
        const updatedElements = elements.map((el: any) =>
          el.id === editingElementIdRef.current
            ? {
                ...element,
                id: el.id,
                angle: el.angle,
                opacity: el.opacity,
                groupIds: el.groupIds,
                frameId: el.frameId,
                boundElements: el.boundElements,
                locked: el.locked,
                link: el.link,
                scale: el.scale,
                index: el.index,
              }
            : el
        );
        excalidrawAPI.updateScene({ elements: updatedElements });
      } else {
        const appState = excalidrawAPI.getAppState();
        const centerX =
          (appState.scrollX * -1 + appState.width / 2) / appState.zoom.value -
          width / 2;
        const centerY =
          (appState.scrollY * -1 + appState.height / 2) / appState.zoom.value -
          height / 2;

        const { element, fileEntry, fileId } = createImageElement({
          svg, width, height, metadata, x: centerX, y: centerY,
        });

        knownFileIdsRef.current.add(fileId);
        excalidrawAPI.addFiles([fileEntry]);
        const currentElements = excalidrawAPI.getSceneElements();
        excalidrawAPI.updateScene({
          elements: [...currentElements, element],
        });
      }

      // Keep the editing target set so repeated "Update" clicks keep
      // replacing the same element instead of inserting duplicates.
      // It is cleared when the panel closes or the tab is switched.
      emitSave();
    },
    [excalidrawAPI, emitSave]
  );

  // ── Tab switching ──

  const handleToggle = useCallback(() => {
    if (isOpen) {
      setActiveTab(null);
      setEditingTypst(null);
      setEditingGraphConfig(null);
      editingElementIdRef.current = null;
    } else {
      const selected = getSelectedElement();
      if (selected?.type === "equation") {
        setEditingTypst(selected.data.typst);
        editingElementIdRef.current = selected.data.elementId;
        setActiveTab("equation");
      } else if (selected?.type === "graph") {
        try {
          setEditingGraphConfig(JSON.parse(selected.data.config));
          editingElementIdRef.current = selected.data.elementId;
        } catch { /* ignore */ }
        setActiveTab("graph");
      } else {
        const next = equationEnabled ? "equation" : graphEnabled ? "graph" : libraryEnabled ? "library" : "slides";
        if (next === "slides") {
          const current = excalidrawAPI?.getSceneElements?.() ?? [];
          const nextSlides = getSlides(current);
          setSlides((previous) => (sameSlideDeck(previous, nextSlides) ? previous : nextSlides));
        }
        setActiveTab(next);
      }
    }
  }, [isOpen, getSelectedElement, equationEnabled, graphEnabled, libraryEnabled, excalidrawAPI]);

  const switchTab = useCallback((tab: ActiveTab) => {
    setEditingTypst(null);
    setEditingGraphConfig(null);
    editingElementIdRef.current = null;

    if (tab === "equation") {
      const selected = getSelectedElement();
      if (selected?.type === "equation") {
        setEditingTypst(selected.data.typst);
        editingElementIdRef.current = selected.data.elementId;
      }
    } else if (tab === "graph") {
      const selected = getSelectedElement();
      if (selected?.type === "graph") {
        try {
          setEditingGraphConfig(JSON.parse(selected.data.config));
          editingElementIdRef.current = selected.data.elementId;
        } catch { /* ignore */ }
      }
    } else if (tab === "slides") {
      const current = excalidrawAPI?.getSceneElements?.() ?? [];
      const nextSlides = getSlides(current);
      setSlides((previous) => (sameSlideDeck(previous, nextSlides) ? previous : nextSlides));
    }

    setActiveTab(tab);
  }, [getSelectedElement, excalidrawAPI]);

  // ── Insert handlers ──

  const handleInsertEquation = useCallback(
    (typst: string, svg: string, width: number, height: number) => {
      const wasEditing = editingElementIdRef.current != null;
      upsertElement(svg, width, height, {
        excalimath_type: "equation",
        excalimath_source: "typst-equation-panel",
        excalimath_typst: typst,
      });
      if (!wasEditing) setEditingTypst(null);
    },
    [upsertElement]
  );

  const handleInsertGraph = useCallback(
    (config: GraphConfig, svg: string, width: number, height: number) => {
      const wasEditing = editingElementIdRef.current != null;
      upsertElement(svg, width, height, {
        excalimath_type: "graph",
        excalimath_source: "graph-panel",
        excalimath_graph_config: JSON.stringify(config),
      });
      if (!wasEditing) setEditingGraphConfig(null);
    },
    [upsertElement]
  );

  const handleInsertShape = useCallback(
    (shape: LibraryShape) => {
      if (!excalidrawAPI) return;
      const appState = excalidrawAPI.getAppState();
      const centerX =
        (appState.scrollX * -1 + appState.width / 2) / appState.zoom.value;
      const centerY =
        (appState.scrollY * -1 + appState.height / 2) / appState.zoom.value;

      const result = shapeToExcalidrawElements(shape, centerX - 50, centerY - 50);
      if (result.files.length > 0) {
        excalidrawAPI.addFiles(result.files);
      }
      const currentElements = excalidrawAPI.getSceneElements();
      excalidrawAPI.updateScene({
        elements: [...currentElements, ...result.elements],
      });
      emitSave();
    },
    [excalidrawAPI, emitSave]
  );

  const handleClose = useCallback(() => {
    setActiveTab(null);
    setEditingTypst(null);
    setEditingGraphConfig(null);
    editingElementIdRef.current = null;
  }, []);

  const focusSlide = useCallback((slide: SlideFrame, animate: boolean) => {
    excalidrawAPI.scrollToContent(slide, {
      fitToViewport: true,
      viewportZoomFactor: animate ? 0.96 : 0.88,
      animate,
      duration: animate ? 350 : 0,
    });
  }, [excalidrawAPI]);

  const handleStartPresentation = useCallback((frameId: string) => {
    handleClose();
    setPresentationFrameId(frameId);
  }, [handleClose]);

  const handleExitPresentation = useCallback(() => {
    setPresentationFrameId(null);
  }, []);

  const handlePreviousSlide = useCallback(() => {
    const deck = slidesRef.current;
    setPresentationFrameId((current) => {
      const index = deck.findIndex((slide) => slide.id === current);
      return index > 0 ? deck[index - 1].id : current;
    });
  }, []);

  const handleNextSlide = useCallback(() => {
    const deck = slidesRef.current;
    setPresentationFrameId((current) => {
      const index = deck.findIndex((slide) => slide.id === current);
      return index >= 0 && index < deck.length - 1 ? deck[index + 1].id : current;
    });
  }, []);

  const handleReorderSlides = useCallback((orderedIds: string[]) => {
    const elements = excalidrawAPI.getSceneElements();
    excalidrawAPI.updateScene({ elements: applySlideOrder(elements, orderedIds) });
    emitSave();
  }, [emitSave, excalidrawAPI]);

  const presentationSlide = useMemo(
    () => slides.find((slide) => slide.id === presentationFrameId) ?? null,
    [presentationFrameId, slides],
  );

  useEffect(() => {
    if (!presentationFrameId) return;
    if (!presentationSlide) {
      handleExitPresentation();
      return;
    }
    focusSlide(presentationSlide, true);
  }, [focusSlide, handleExitPresentation, presentationFrameId, presentationSlide]);

  // ── Tab definitions ──

  const tabs = useMemo(() => {
    const list: { id: ActiveTab; label: string; icon: string }[] = [];
    if (equationEnabled) list.push({ id: "equation", label: "Equation", icon: "∑" });
    if (graphEnabled) list.push({ id: "graph", label: "Graph", icon: "ƒ" });
    if (libraryEnabled) list.push({ id: "library", label: "Shapes", icon: "△" });
    if (slidesEnabled) list.push({ id: "slides", label: "Slides", icon: "▣" });
    return list;
  }, [equationEnabled, graphEnabled, libraryEnabled, slidesEnabled]);

  return (
    <>
      <style>{`
        .excalidraw .HintViewer {
          display: none !important;
        }
      `}</style>
      {/* ── Toolbar toggle button ── */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Toggle ExcaliMath panel"
        aria-expanded={isOpen ? "true" : "false"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          backgroundColor: isOpen ? t.accent : t.bg,
          color: isOpen ? t.accentText : t.accent,
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 700,
          boxShadow: `0 1px 4px ${t.shadow}`,
          transition: "all 0.15s",
          fontFamily: "serif",
        }}
        title="ExcaliMath"
      >
        ∑
      </button>

      {/* ── Sidebar ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="ExcaliMath"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            zIndex: 1000,
            backgroundColor: t.bg,
            borderLeft: `1px solid ${t.border}`,
            display: "flex",
            flexDirection: "column",
            boxShadow: `-4px 0 20px ${t.shadow}`,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {/* ── Header with tabs ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: `1px solid ${t.border}`,
              padding: "0 8px",
              height: 48,
              gap: 0,
            }}
          >
            <div role="tablist" aria-label="ExcaliMath tools" style={{ display: "flex", flex: 1, gap: 2 }}>
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id ? "true" : "false"}
                  aria-controls={`excalimath-panel-${tab.id}`}
                  onClick={() => switchTab(tab.id)}
                  title={tab.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    border: "none",
                    borderRadius: 8,
                    backgroundColor:
                      activeTab === tab.id ? t.accentMuted : "transparent",
                    color:
                      activeTab === tab.id ? t.accent : t.textMuted,
                    cursor: "pointer",
                    fontSize: 20,
                    fontWeight: 600,
                    transition: "all 0.15s",
                    fontFamily: "serif",
                  }}
                >
                  {tab.icon}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close ExcaliMath panel"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                border: "none",
                borderRadius: 6,
                backgroundColor: "transparent",
                color: t.textMuted,
                cursor: "pointer",
                fontSize: 20,
                transition: "color 0.15s",
              }}
            >
              ×
            </button>
          </div>

          {/* ── Panel content ── */}
          <div
            role="tabpanel"
            id={`excalimath-panel-${activeTab}`}
            style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}
          >
            {activeTab === "equation" && equationEnabled && (
              <EquationPanel
                visible={true}
                onInsert={handleInsertEquation}
                editingTypst={editingTypst}
                onClose={handleClose}
                isDark={isDark}
                renderEquation={renderEquation}
              />
            )}
            {activeTab === "graph" && graphEnabled && (
              <GraphPanel
                visible={true}
                onInsert={handleInsertGraph}
                editingConfig={editingGraphConfig}
                onClose={handleClose}
                isDark={isDark}
              />
            )}
            {activeTab === "library" && libraryEnabled && (
              <LibraryPanel
                visible={true}
                onInsert={handleInsertShape}
                onClose={handleClose}
                isDark={isDark}
              />
            )}
            {activeTab === "slides" && slidesEnabled && (
              <SlidesPanel
                slides={slides}
                isDark={isDark}
                onFocus={(slide) => focusSlide(slide, false)}
                onPresent={handleStartPresentation}
                onReorder={handleReorderSlides}
              />
            )}
          </div>
        </div>
      )}
      {presentationFrameId && (
        <PresentationMode
          slides={slides}
          currentFrameId={presentationFrameId}
          isDark={isDark}
          onPrevious={handlePreviousSlide}
          onNext={handleNextSlide}
          onExit={handleExitPresentation}
        />
      )}
    </>
  );
});

