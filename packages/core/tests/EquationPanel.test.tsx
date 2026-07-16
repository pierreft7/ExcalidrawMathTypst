// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renderTypstToSvg } = vi.hoisted(() => ({ renderTypstToSvg: vi.fn() }));

vi.mock("../src/plugins/equation/renderer", () => ({
  renderTypstToSvg,
  TypstRenderSupersededError: class TypstRenderSupersededError extends Error {},
}));

import { EquationPanel } from "../src/ui/EquationPanel";

describe("EquationPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    renderTypstToSvg.mockReset();
    renderTypstToSvg.mockResolvedValue({
      svg: '<svg viewBox="0 0 80 24"><path d="M0 0h10v10z" /></svg>',
      width: 80,
      height: 24,
    });
  });

  it("renders one SVG preview without duplicate HTML or MathML text", async () => {
    render(
      <EquationPanel
        visible
        editingTypst="x^2"
        onInsert={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const preview = await screen.findByTestId("typst-equation-preview", {}, { timeout: 1500 });
    expect(preview.querySelectorAll("svg")).toHaveLength(1);
    expect(preview.querySelector("math")).toBeNull();
    expect(preview.querySelector(".katex")).toBeNull();
    expect(preview).not.toHaveTextContent("x^2");
  });

  it("inserts the exact native Typst source and compiled SVG", async () => {
    const onInsert = vi.fn();
    const hostRenderer = vi.fn().mockResolvedValue({
      svg: '<svg viewBox="0 0 80 24"><path d="M0 0h10v10z" /></svg>',
      width: 80,
      height: 24,
    });
    render(
      <EquationPanel
        visible
        onInsert={onInsert}
        onClose={vi.fn()}
        renderEquation={hostRenderer}
      />,
    );
    fireEvent.change(screen.getByLabelText("Typst math"), { target: { value: "sqrt(x)" } });

    await screen.findByTestId("typst-equation-preview", {}, { timeout: 1500 });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith(
      "sqrt(x)",
      expect.stringContaining("<svg"),
      80,
      24,
    ));
    expect(hostRenderer).toHaveBeenCalledWith("sqrt(x)", { latestOnly: true });
  });
});
