import { describe, expect, it } from "vitest";
import { expressionToTypst, expressionToTypstLambda } from "../src/plugins/graph/expressionToTypst";
import { labelToTypstContent } from "../src/plugins/graph/plotRenderer";
import { buildGraphTypstDocument } from "../src/plugins/graph/plotRenderer";
import { createDefaultGraphConfig } from "../src/plugins/graph/types";

describe("expressionToTypst", () => {
  it("translates arithmetic operators", () => {
    expect(expressionToTypst("x^2 + 2*x")).toBe("calc.pow(x, 2.0) + 2.0 * x");
    expect(expressionToTypst("x - 1 / 2")).toBe("x - 1.0 / 2.0");
  });

  it("translates common functions to calc.*", () => {
    expect(expressionToTypst("sin(x)")).toBe("calc.sin(x)");
    expect(expressionToTypst("sqrt(1 - x^2)")).toBe(
      "(if 1.0 - calc.pow(x, 2.0) < 0.0 { none } else { calc.sqrt(1.0 - calc.pow(x, 2.0)) })"
    );
    expect(expressionToTypst("abs(x)")).toBe("calc.abs(x)");
    expect(expressionToTypst("exp(x)")).toBe("calc.exp(x)");
    expect(expressionToTypst("ln(x)")).toBe("(if x <= 0.0 { none } else { calc.ln(x) })");
  });

  it("handles log bases like mathjs", () => {
    expect(expressionToTypst("log(x)")).toBe("(if x <= 0.0 { none } else { calc.log10(x) })");
    expect(expressionToTypst("log(x, 2)")).toBe("(if x <= 0.0 { none } else { calc.log(x, base: 2.0) })");
  });

  it("maps constants", () => {
    expect(expressionToTypst("pi * x")).toBe("calc.pi * x");
    expect(expressionToTypst("e^x")).toBe("calc.pow(calc.e, x)");
  });

  it("handles implicit multiplication and unary minus", () => {
    expect(expressionToTypst("2x")).toBe("2.0 * x");
    expect(expressionToTypst("-x^2")).toBe("(-calc.pow(x, 2.0))");
    expect(expressionToTypst("-sqrt(1 - x^2)")).toBe(
      "(if 1.0 - calc.pow(x, 2.0) < 0.0 { none } else { -calc.sqrt(1.0 - calc.pow(x, 2.0)) })"
    );
  });

  it("keeps decimal numbers as decimals", () => {
    expect(expressionToTypst("0.5 * x")).toBe("0.5 * x");
  });

  it("wraps into a lambda", () => {
    expect(expressionToTypstLambda("x^2")).toBe("x => calc.pow(x, 2.0)");
  });

  it("rejects unsupported constructs", () => {
    expect(() => expressionToTypst("x!")).toThrow();
    expect(() => expressionToTypst("gamma(x)")).toThrow();
  });

  it("translates every template expression", () => {
    const templates = [
      "x", "x^2", "sin(x)", "cos(x)", "sqrt(1 - x^2)", "-sqrt(1 - x^2)",
      "0", "exp(x)", "abs(x)", "x^3 - 3*x",
    ];
    for (const expr of templates) {
      expect(() => expressionToTypst(expr)).not.toThrow();
    }
  });
});

describe("labelToTypstContent", () => {
  it("renders formula labels as math", () => {
    expect(labelToTypstContent("y = x²")).toBe("$y = x^2$");
    expect(labelToTypstContent("y = eˣ")).toBe("$y = e^x$");
    expect(labelToTypstContent("sin(x)")).toBe("$sin(x)$");
    expect(labelToTypstContent("y = |x|")).toBe("$y = mid x mid$");
  });

  it("renders plain labels as text", () => {
    expect(labelToTypstContent("upper")).toBe("[upper]");
    expect(labelToTypstContent("")).toBe("none");
  });
});

describe("buildGraphTypstDocument", () => {
  it("produces a compileable-looking document", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x^2", color: "#6965db", label: "y = x²" };
    config.axis.xLabel = "";
    config.axis.showMinorGrid = true;
    config.backgroundColor = "#1e1e1e";
    config.zoom = {
      center: [0, 0.1],
      size: 0.6,
      magnification: 3,
      at: "bottom-right",
    };
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain('#import "@preview/simple-plot:1.0.0"');
    expect(doc).toContain("(fn: x => calc.pow(x, 2.0)");
    expect(doc).toContain('label: text(fill: rgb("#6965db"), $y = x^2$)');
    expect(doc).toContain('show-grid: "both"');
    expect(doc).toContain("xlabel: none");
    expect(doc).toContain("zoom(center: (0, 0.1), size: 0.6, magnification: 3, at: \"bottom-right\"");
  });

  it("emits the style dict (background colour)", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x", color: "#6965db", label: "" };
    config.backgroundColor = "#1e1e1e";
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain("style: (");
    expect(doc).toContain('background: (fill: rgb("#1e1e1e"))');
    expect(doc).toContain("stroke: luma(120)");
  });

  it("supports custom zoom placement in data coordinates", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x", color: "#6965db" };
    config.zoom = { center: [2, 3], size: 1.2, at: [-4, 5] };
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain("zoom(center: (2, 3), size: 1.2, at: (-4, 5)");
  });

  it("matches the zoom inset background to the plot background", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x", color: "#6965db" };
    config.backgroundColor = "#1e1e1e";
    config.zoom = { center: [0, 0.1], size: 0.6, magnification: 3, at: "bottom-right" };
    expect(buildGraphTypstDocument(config)).toContain('box-fill: rgb("#1e1e1e")');

    config.backgroundColor = "transparent";
    expect(buildGraphTypstDocument(config)).toContain("box-fill: none");
  });

  it("renders legacy zoom specs via region", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x", color: "#6965db" };
    config.zoom = {
      region: [-1.6, -2.4, 1.6, 2.4],
      at: [-2.5, 3.1],
      magnification: 4,
    } as never;
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain("zoom(region: (-1.6, -2.4, 1.6, 2.4), magnification: 4, at: (-2.5, 3.1)");
  });

  it("uses transparent background style by default", () => {
    const config = createDefaultGraphConfig();
    config.functions[0] = { expression: "x", color: "#6965db" };
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain("background: (fill: none)");
  });

  it("adapts sample count to the plotted range", () => {
    const config = createDefaultGraphConfig(); // axis -10..10
    config.functions[0] = { expression: "sin(x)", color: "#6965db" };
    const doc = buildGraphTypstDocument(config);
    expect(doc).toContain("samples: 240");
    expect(doc).toContain("domain: (-10.0, 10.0)");

    config.functions[0].samples = 80;
    expect(buildGraphTypstDocument(config)).toContain("samples: 80");

    config.functions[0] = {
      expression: "sin(x)", color: "#6965db",
      domainMin: -3, domainMax: 3,
    };
    const restricted = buildGraphTypstDocument(config);
    expect(restricted).toContain("samples: 200");
    expect(restricted).toContain("domain: (-3.0, 3.0)");
  });
});
