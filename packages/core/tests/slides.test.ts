import { describe, expect, it } from "vitest";
import {
  PRESENTATION_ORDER_KEY,
  applySlideOrder,
  getSlideLabel,
  getSlides,
  reorderSlideIds,
} from "../src/plugins/slides";

const frame = (id: string, name: string | null = null, customData?: Record<string, unknown>) => ({
  id,
  type: "frame" as const,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  name,
  customData,
});

describe("slides", () => {
  it("uses scene creation order for frames without a persisted deck order", () => {
    const slides = getSlides([
      frame("second", "Second"),
      { id: "shape", type: "rectangle" },
      frame("first", null),
      { ...frame("deleted"), isDeleted: true },
    ]);

    expect(slides.map((slide) => slide.id)).toEqual(["second", "first"]);
    expect(getSlideLabel(slides[1], 1)).toBe("Slide 2");
  });

  it("uses persisted ranks and appends unranked newly created frames", () => {
    const slides = getSlides([
      frame("new"),
      frame("third", null, { [PRESENTATION_ORDER_KEY]: 2 }),
      frame("first", null, { [PRESENTATION_ORDER_KEY]: 0 }),
      frame("second", null, { [PRESENTATION_ORDER_KEY]: 1 }),
    ]);

    expect(slides.map((slide) => slide.id)).toEqual(["first", "second", "third", "new"]);
  });

  it("persists drag-reordered ranks without changing other element data", () => {
    const elements = [
      frame("one", "One", { preserved: true }),
      { id: "shape", type: "rectangle", customData: { untouched: true } },
      frame("two", "Two"),
    ];
    const ordered = applySlideOrder(elements, ["two", "one"]);

    expect(ordered).not.toBe(elements);
    expect(ordered[0].customData).toEqual({ preserved: true, [PRESENTATION_ORDER_KEY]: 1 });
    expect(ordered[1]).toBe(elements[1]);
    expect(ordered[2].customData).toEqual({ [PRESENTATION_ORDER_KEY]: 0 });
    expect(getSlides(ordered).map((slide) => slide.id)).toEqual(["two", "one"]);
  });

  it("moves only the dragged slide in the deck", () => {
    expect(reorderSlideIds(["one", "two", "three"], "three", "one")).toEqual(["three", "one", "two"]);
    expect(reorderSlideIds(["one", "two"], "missing", "two")).toEqual(["one", "two"]);
  });
});
