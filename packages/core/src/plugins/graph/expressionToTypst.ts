/**
 * @module graph/expressionToTypst
 *
 * Translates mathjs-style function expressions ("sin(x)", "x^2 + 2*x",
 * "sqrt(1 - x^2)") into Typst lambda bodies consumable by the
 * simple-plot package ("calc.sin(x)", "calc.pow(x, 2) + 2 * x", ...).
 *
 * Parsing goes through mathjs — no eval() is ever used.
 */

import { parse } from "mathjs";
import {
  ConstantNode,
  FunctionNode,
  OperatorNode,
  ParenthesisNode,
  SymbolNode,
  type MathNode,
} from "mathjs";

const FN_MAP: Record<string, string> = {
  sqrt: "calc.sqrt",
  abs: "calc.abs",
  sin: "calc.sin",
  cos: "calc.cos",
  tan: "calc.tan",
  asin: "calc.asin",
  acos: "calc.acos",
  atan: "calc.atan",
  atan2: "calc.atan2",
  sinh: "calc.sinh",
  cosh: "calc.cosh",
  tanh: "calc.tanh",
  asinh: "calc.asinh",
  acosh: "calc.acosh",
  atanh: "calc.atanh",
  exp: "calc.exp",
  ln: "calc.ln",
  log10: "calc.log10",
  log2: "calc.log2",
  floor: "calc.floor",
  ceil: "calc.ceil",
  round: "calc.round",
  sign: "calc.sign",
  min: "calc.min",
  max: "calc.max",
  pow: "calc.pow",
};

const SYMBOL_MAP: Record<string, string> = {
  pi: "calc.pi",
  e: "calc.e",
  tau: "calc.tau",
};

function compileNode(node: MathNode, negate = false): string {
  if (node instanceof ConstantNode) {
    if (typeof node.value !== "number" || !Number.isFinite(node.value)) {
      throw new Error("Only numeric constants are supported.");
    }
    // Use decimal notation for integers to avoid Typst int/float pitfalls.
    const formatted = String(node.value).replace("e+", "e");
    return negate
      ? `(-${formatted})`
      : Number.isInteger(node.value) ? `${formatted}.0` : formatted;
  }
  if (node instanceof SymbolNode) {
    if (node.name in SYMBOL_MAP) return SYMBOL_MAP[node.name];
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.name)) return negate ? `(-${node.name})` : node.name;
    throw new Error(`Unsupported symbol "${node.name}".`);
  }
  if (node instanceof ParenthesisNode) {
    const inner = compileNode(node.content, negate);
    return inner.startsWith("(") ? inner : `(${inner})`;
  }
  if (node instanceof FunctionNode) {
    const name = node.fn.name;
    const args = node.args.map((a) => compileNode(a));
    // Domain-restricted functions: return `none` (a gap) instead of
    // crashing when sampled outside their domain, e.g. by label placement.
    // Negation is folded into the else-branch so `none` is never negated.
    const guarded = (fn: string, argList: string, cond: string) =>
      `(if ${cond} { none } else { ${negate ? "-" : ""}${fn}(${argList}) })`;
    if (name === "sqrt") return guarded("calc.sqrt", args[0], `${args[0]} < 0.0`);
    if (name === "ln") return guarded("calc.ln", args[0], `${args[0]} <= 0.0`);
    if (name === "log10") return guarded("calc.log10", args[0], `${args[0]} <= 0.0`);
    if (name === "log2") return guarded("calc.log2", args[0], `${args[0]} <= 0.0`);
    if (name === "log") {
      // mathjs log(x) is base 10; log(x, b) is log base b.
      if (args.length === 1) return guarded("calc.log10", args[0], `${args[0]} <= 0.0`);
      return guarded("calc.log", `${args[0]}, base: ${args[1]}`, `${args[0]} <= 0.0`);
    }
    if (name === "cbrt") return `calc.pow(${args[0]}, 1.0 / 3.0)`;
    const target = FN_MAP[name];
    if (!target) throw new Error(`Unsupported function "${name}(...)".`);
    return `${negate ? "-" : ""}${target}(${args.join(", ")})`;
  }
  if (node instanceof OperatorNode) {
    if (node.isUnary()) {
      if (node.op === "-") {
        const inner = node.args[0];
        // Fold the negation into leaves (functions, symbols, constants) so
        // `none`-guarded functions stay valid; wrap compound operands.
        if (inner instanceof OperatorNode || inner instanceof ParenthesisNode) {
          return `(-${compileNode(inner)})`;
        }
        return compileNode(inner, true);
      }
      if (node.op === "+") return compileNode(node.args[0], negate);
      throw new Error(`Unsupported operator "${node.op}".`);
    }
    const a = compileNode(node.args[0]);
    const b = compileNode(node.args[1]);
    switch (node.op) {
      case "^":
        return `calc.pow(${a}, ${b})`;
      case "*":
        return `${a} * ${b}`;
      case "/":
        return `${a} / ${b}`;
      case "+":
        return `${a} + ${b}`;
      case "-":
        return `${a} - ${b}`;
      case "mod":
      case "%":
        return `calc.rem(${a}, ${b})`;
      default:
        throw new Error(`Unsupported operator "${node.op}".`);
    }
  }
  throw new Error(`Unsupported expression part (${node.type}).`);
}

/**
 * Translate a mathjs-style expression into a Typst lambda body.
 * Throws with a human-readable message when a construct cannot be mapped.
 */
export function expressionToTypst(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) throw new Error("Empty expression.");
  let node: MathNode;
  try {
    node = parse(trimmed);
  } catch {
    throw new Error("Expression is not valid math.");
  }
  return compileNode(node);
}

/** Wrap a translated expression into a full Typst lambda. */
export function expressionToTypstLambda(expression: string): string {
  return `x => ${expressionToTypst(expression)}`;
}
