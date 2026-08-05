/**
 * Frame-backed presentation helpers. Frames remain ordinary Excalidraw
 * elements; manual deck order is persisted in their serialisable customData.
 */

export const PRESENTATION_ORDER_KEY = "excalimath_presentation_order";

export interface SlideFrame {
  id: string;
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  type: "frame";
}

function getPresentationOrder(slide: SlideFrame): number | null {
  const value = slide.customData?.[PRESENTATION_ORDER_KEY];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Frames without a manual rank keep their scene order (the creation-order
 * fallback). Ranked frames form the persisted deck and unranked new frames
 * are appended after it.
 */
export function getSlides(elements: readonly unknown[]): SlideFrame[] {
  const frames = elements.flatMap((element, sceneIndex) => {
    const candidate = element as Partial<SlideFrame>;
    return candidate.type === "frame" && !candidate.isDeleted
      ? [{ slide: candidate as SlideFrame, sceneIndex, order: getPresentationOrder(candidate as SlideFrame) }]
      : [];
  });

  return frames
    .sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order || a.sceneIndex - b.sceneIndex;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.sceneIndex - b.sceneIndex;
    })
    .map(({ slide }) => slide);
}

export function getSlideLabel(slide: SlideFrame, index: number): string {
  return slide.name?.trim() || `Slide ${index + 1}`;
}

export function reorderSlideIds(ids: readonly string[], fromId: string, toId: string): string[] {
  const sourceIndex = ids.indexOf(fromId);
  const targetIndex = ids.indexOf(toId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...ids];

  const next = [...ids];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

/** Returns a new scene with persisted manual ranks for every listed frame. */
export function applySlideOrder<T>(elements: readonly T[], orderedIds: readonly string[]): T[] {
  const ranks = new Map(orderedIds.map((id, index) => [id, index]));
  return elements.map((element) => {
    const candidate = element as T & Partial<SlideFrame>;
    const rank = candidate.type === "frame" ? ranks.get(candidate.id ?? "") : undefined;
    if (rank === undefined) return element;
    return {
      ...candidate,
      customData: {
        ...candidate.customData,
        [PRESENTATION_ORDER_KEY]: rank,
      },
    } as T;
  });
}

export function sameSlideDeck(previous: readonly SlideFrame[], next: readonly SlideFrame[]): boolean {
  return previous.length === next.length && previous.every((slide, index) => {
    const candidate = next[index];
    return slide.id === candidate.id &&
      slide.name === candidate.name &&
      slide.x === candidate.x && slide.y === candidate.y &&
      slide.width === candidate.width && slide.height === candidate.height &&
      getPresentationOrder(slide) === getPresentationOrder(candidate);
  });
}
