import { describe, expect, it } from "vitest";
import { expressionLibrary, filterExpressions } from "../src/plugins/equation/expressionLibrary";

describe("Typst expression library", () => {
  it("contains only native Typst entries", () => {
    expect(expressionLibrary.length).toBeGreaterThan(30);
    for (const entry of expressionLibrary) {
      expect(entry.typst).toBeTruthy();
      expect(entry).not.toHaveProperty("latex");
      expect(entry.typst).not.toContain("\\");
    }
  });

  it("searches native Typst source", () => {
    expect(filterExpressions(undefined, "frac").some((entry) => entry.typst.includes("frac"))).toBe(true);
  });
});
