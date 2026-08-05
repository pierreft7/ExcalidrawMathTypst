import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSlideLabel,
  reorderSlideIds,
  type SlideFrame,
} from "../plugins/slides";
import { getTheme } from "./theme";

export interface SlidesPanelProps {
  slides: readonly SlideFrame[];
  isDark: boolean;
  onFocus: (slide: SlideFrame) => void;
  onPresent: (frameId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export interface PresentationModeProps {
  slides: readonly SlideFrame[];
  currentFrameId: string;
  isDark: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}

const iconButtonStyle = (disabled = false): React.CSSProperties => ({
  width: 32,
  height: 32,
  border: "none",
  borderRadius: 8,
  background: "transparent",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.38 : 1,
  fontSize: 18,
});

/** Compact, in-canvas presenter navigation. It never renders a separate slide. */
export function PresentationMode({
  slides,
  currentFrameId,
  isDark,
  onPrevious,
  onNext,
  onExit,
}: PresentationModeProps) {
  const t = getTheme(isDark);
  const currentIndex = slides.findIndex((slide) => slide.id === currentFrameId);
  const currentSlide = slides[currentIndex];
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex === slides.length - 1;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onExit();
    } else if (["ArrowRight", " ", "PageDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      onNext();
    } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      onPrevious();
    }
  }, [onExit, onNext, onPrevious]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (!currentSlide || currentIndex < 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Presentation controls"
      style={{
        position: "fixed",
        zIndex: 2000,
        bottom: 18,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 6,
        border: `1px solid ${t.border}`,
        borderRadius: 999,
        background: t.bg,
        boxShadow: `0 8px 28px ${t.shadow}`,
        color: t.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <button type="button" onClick={onPrevious} disabled={isFirst} aria-label="Previous slide" style={{ ...iconButtonStyle(isFirst), color: t.text }}>‹</button>
      <span aria-live="polite" style={{ minWidth: 150, maxWidth: 240, padding: "0 8px", textAlign: "center", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {currentIndex + 1} / {slides.length} · {getSlideLabel(currentSlide, currentIndex)}
      </span>
      <button type="button" onClick={onNext} disabled={isLast} aria-label="Next slide" style={{ ...iconButtonStyle(isLast), color: t.text }}>›</button>
      <span aria-hidden="true" style={{ height: 20, borderLeft: `1px solid ${t.border}`, margin: "0 4px" }} />
      <button type="button" onClick={onExit} aria-label="Exit presentation" title="Exit presentation" style={{ ...iconButtonStyle(), color: t.text, fontSize: 14, width: 42 }}>Exit</button>
    </div>
  );
}

/** Lists native Excalidraw frames and allows their deck order to be persisted. */
export function SlidesPanel({ slides, isDark, onFocus, onPresent, onReorder }: SlidesPanelProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const t = getTheme(isDark);
  const slideIds = useMemo(() => slides.map((slide) => slide.id), [slides]);

  const dropOn = useCallback((targetId: string) => {
    if (!draggingId) return;
    onReorder(reorderSlideIds(slideIds, draggingId, targetId));
    setDraggingId(null);
  }, [draggingId, onReorder, slideIds]);

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%", color: t.text }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>Presentation</h2>
        <p style={{ color: t.textMuted, fontSize: 13, margin: "4px 0 0" }}>Drag frames to order your deck</p>
      </div>
      {slides.length === 0 ? (
        <p style={{ color: t.textMuted, lineHeight: 1.5, margin: "20px 0" }}>Draw frames with Excalidraw’s Frame tool. Every frame becomes a slide.</p>
      ) : (
        <div role="list" aria-label="Slides" style={{ display: "grid", gap: 8, marginTop: 16 }}>
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              role="listitem"
              draggable
              onDragStart={() => setDraggingId(slide.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(slide.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: `1px solid ${draggingId === slide.id ? t.accent : t.border}`, borderRadius: 8, background: draggingId === slide.id ? t.accentMuted : "transparent", cursor: "grab" }}
            >
              <span aria-hidden="true" style={{ color: t.textMuted, minWidth: 16 }}>⠿</span>
              <span style={{ color: t.textMuted, minWidth: 18 }}>{index + 1}</span>
              <button type="button" onClick={() => onFocus(slide)} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left", whiteSpace: "nowrap", border: 0, background: "transparent", color: t.text, cursor: "pointer" }}>
                {getSlideLabel(slide, index)}
              </button>
              <button type="button" onClick={() => onPresent(slide.id)} aria-label={`Present ${getSlideLabel(slide, index)}`} style={{ border: `1px solid ${t.border}`, borderRadius: 6, background: t.bgElevated, color: t.text, cursor: "pointer", padding: "5px 8px" }}>Present</button>
            </div>
          ))}
        </div>
      )}
      {slides.length > 0 && <button type="button" onClick={() => onPresent(slides[0].id)} style={{ width: "100%", marginTop: 16, border: 0, borderRadius: 7, padding: 10, background: t.accent, color: t.accentText, cursor: "pointer", fontWeight: 600 }}>Present from first frame</button>}
      <p style={{ color: t.textFaint, fontSize: 12, lineHeight: 1.45, marginTop: 16 }}>Use Arrow keys, Space, Page Up/Down, or the bottom controls to move between frames. Press Esc to exit.</p>
    </div>
  );
}
