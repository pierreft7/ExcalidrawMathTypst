import { describe, expect, it } from "vitest";
import { getSelectedExcalimathElement } from "../src/core/stateBridge";

describe("Typst equation metadata", () => {
  it("opens native Typst equations for editing", () => {
    expect(getSelectedExcalimathElement([{
      id: "equation-1",
      customData: {
        excalimath_type: "equation",
        excalimath_source: "typst-equation-panel",
        excalimath_typst: "frac(a, b)",
      },
    }])).toEqual({
      type: "equation",
      data: { elementId: "equation-1", typst: "frac(a, b)" },
    });
  });

  it("does not recognize legacy LaTeX-only equation metadata", () => {
    expect(getSelectedExcalimathElement([{
      id: "legacy",
      customData: {
        excalimath_type: "equation",
        excalimath_source: "equation-panel",
        excalimath_latex: "\\frac{a}{b}",
      },
    }])).toBeNull();
  });
});
