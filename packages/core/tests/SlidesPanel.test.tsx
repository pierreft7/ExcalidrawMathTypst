// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExcaliMath } from "../src/ui/ExcaliMath";
import { PresentationMode, SlidesPanel } from "../src/ui/SlidesPanel";

const slides = [
  { id: "one", type: "frame" as const, name: "Introduction", x: 0, y: 0, width: 100, height: 100 },
  { id: "two", type: "frame" as const, name: "Conclusion", x: 200, y: 0, width: 100, height: 100 },
];

describe("presentation controls", () => {
  afterEach(cleanup);

  it("navigates exactly once from controls and keyboard shortcuts", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onExit = vi.fn();
    render(
      <PresentationMode
        slides={slides}
        currentFrameId="one"
        isDark={false}
        onPrevious={onPrevious}
        onNext={onNext}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it("does not navigate while typing in an editor input", () => {
    const onNext = vi.fn();
    render(
      <>
        <input aria-label="Editor input" />
        <PresentationMode slides={slides} currentFrameId="one" isDark={false} onPrevious={vi.fn()} onNext={onNext} onExit={vi.fn()} />
      </>,
    );

    fireEvent.keyDown(screen.getByLabelText("Editor input"), { key: " " });
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("slide sidebar", () => {
  afterEach(cleanup);

  it("focuses the clicked frame and persists a drag reorder", () => {
    const onFocus = vi.fn();
    const onReorder = vi.fn();
    render(
      <SlidesPanel
        slides={slides}
        isDark={false}
        onFocus={onFocus}
        onPresent={vi.fn()}
        onReorder={onReorder}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Introduction" }));
    expect(onFocus).toHaveBeenCalledWith(slides[0]);

    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[1]);
    fireEvent.dragOver(rows[0]);
    fireEvent.drop(rows[0]);
    expect(onReorder).toHaveBeenCalledWith(["two", "one"]);
  });
});

describe("presentation controller", () => {
  afterEach(cleanup);

  const createApi = () => ({
    getSceneElements: vi.fn(() => slides),
    getAppState: vi.fn(() => ({ theme: "light" })),
    getFiles: vi.fn(() => ({})),
    onChange: vi.fn(() => () => {}),
    scrollToContent: vi.fn(),
  });

  it("focuses the sidebar frame exactly once", async () => {
    const api = createApi();
    render(<ExcaliMath excalidrawAPI={api} enabledPlugins={["slides"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle ExcaliMath panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Introduction" }));
    await waitFor(() => expect(api.scrollToContent).toHaveBeenCalledTimes(1));
    expect(api.scrollToContent.mock.calls[0][0]).toEqual(slides[0]);
  });

  it("focuses exactly the selected next frame", async () => {
    const api = createApi();
    render(<ExcaliMath excalidrawAPI={api} enabledPlugins={["slides"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle ExcaliMath panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Present from first frame" }));
    await waitFor(() => expect(api.scrollToContent).toHaveBeenCalledTimes(1));
    expect(api.scrollToContent.mock.calls[0][0]).toEqual(slides[0]);

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    await waitFor(() => expect(api.scrollToContent).toHaveBeenCalledTimes(2));
    expect(api.scrollToContent.mock.calls[1][0]).toEqual(slides[1]);
  });

  it("exits presentation if the active frame is deleted", async () => {
    let emitSceneChange: ((elements: readonly unknown[]) => void) | undefined;
    const api = createApi();
    api.onChange.mockImplementation((callback: (elements: readonly unknown[]) => void) => {
      emitSceneChange = callback;
      return () => {};
    });
    render(<ExcaliMath excalidrawAPI={api} enabledPlugins={["slides"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle ExcaliMath panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Present from first frame" }));
    await screen.findByRole("toolbar", { name: "Presentation controls" });

    emitSceneChange?.([{ ...slides[0], isDeleted: true }, slides[1]]);
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "Presentation controls" })).not.toBeInTheDocument());
  });
});
