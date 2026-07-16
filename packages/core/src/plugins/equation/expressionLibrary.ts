export interface ExpressionEntry {
  label: string;
  typst: string;
  category: string;
}

/** Native Typst math snippets. Values are inserted inside a Typst math block. */
export const expressionLibrary: ExpressionEntry[] = [
  { label: "Simple fraction", typst: "frac(a, b)", category: "Fractions" },
  { label: "Mixed number", typst: "2 frac(3, 4)", category: "Fractions" },
  { label: "Nested fraction", typst: "frac(frac(a, b), frac(c, d))", category: "Fractions" },
  { label: "Continued fraction", typst: "a + frac(1, b + frac(1, c))", category: "Fractions" },

  { label: "Square root", typst: "sqrt(x)", category: "Powers & Roots" },
  { label: "nth root", typst: "root(n, x)", category: "Powers & Roots" },
  { label: "Exponent", typst: "x^n", category: "Powers & Roots" },
  {
    label: "Quadratic formula",
    typst: "x = frac(-b plus.minus sqrt(b^2 - 4 a c), 2 a)",
    category: "Powers & Roots",
  },

  { label: "Equation", typst: "a x + b = c", category: "Algebra" },
  { label: "System of equations", typst: "cases(x + y = 5, 2 x - y = 1)", category: "Algebra" },
  { label: "Inequality", typst: "x^2 - 4 >= 0", category: "Algebra" },
  { label: "Absolute value", typst: "abs(x - a) < epsilon", category: "Algebra" },
  {
    label: "Binomial expansion",
    typst: "(a + b)^n = sum_(k=0)^n binom(n, k) a^(n-k) b^k",
    category: "Algebra",
  },

  { label: "Sine", typst: "sin(theta)", category: "Trigonometry" },
  { label: "Cosine", typst: "cos(theta)", category: "Trigonometry" },
  { label: "Tangent", typst: "tan(theta)", category: "Trigonometry" },
  { label: "Pythagorean identity", typst: "sin^2 theta + cos^2 theta = 1", category: "Trigonometry" },
  { label: "Law of cosines", typst: "c^2 = a^2 + b^2 - 2 a b cos(C)", category: "Trigonometry" },

  { label: "Limit", typst: "lim_(x -> a) f(x)", category: "Calculus" },
  { label: "Limit at infinity", typst: "lim_(x -> infinity) frac(1, x) = 0", category: "Calculus" },
  { label: "Derivative", typst: "frac(dif f, dif x)", category: "Calculus" },
  { label: "Second derivative", typst: "frac(dif^2 f, dif x^2)", category: "Calculus" },
  { label: "Partial derivative", typst: "frac(partial f, partial x)", category: "Calculus" },
  {
    label: "Chain rule",
    typst: "frac(dif y, dif x) = frac(dif y, dif u) dot frac(dif u, dif x)",
    category: "Calculus",
  },
  { label: "Indefinite integral", typst: "integral f(x) dif x", category: "Calculus" },
  { label: "Definite integral", typst: "integral_a^b f(x) dif x", category: "Calculus" },
  { label: "Double integral", typst: "integral.double_D f(x, y) dif A", category: "Calculus" },

  { label: "Summation", typst: "sum_(i=1)^n a_i", category: "Summation" },
  { label: "Product", typst: "product_(i=1)^n a_i", category: "Summation" },
  {
    label: "Geometric series",
    typst: "sum_(k=0)^infinity a r^k = frac(a, 1-r)",
    category: "Summation",
  },

  { label: "2x2 Matrix", typst: "mat(a, b; c, d)", category: "Matrices" },
  { label: "3x3 Matrix", typst: "mat(a, b, c; d, e, f; g, h, i)", category: "Matrices" },
  { label: "Determinant", typst: "det(mat(a, b; c, d)) = a d - b c", category: "Matrices" },

  { label: "Alpha, Beta, Gamma", typst: "alpha, beta, gamma", category: "Greek Letters" },
  { label: "Pi", typst: "pi approx 3.14159", category: "Greek Letters" },
  { label: "Sigma, Delta", typst: "Sigma, Delta, Omega", category: "Greek Letters" },

  { label: "Angle", typst: "angle A B C = 90 degree", category: "Geometry" },
  { label: "Triangle area", typst: "A = frac(1, 2) b h", category: "Geometry" },
  { label: "Circle area", typst: "A = pi r^2", category: "Geometry" },
  { label: "Pythagorean theorem", typst: "a^2 + b^2 = c^2", category: "Geometry" },
];

export function getCategories(): string[] {
  return [...new Set(expressionLibrary.map((entry) => entry.category))];
}

export function filterExpressions(category?: string, search?: string): ExpressionEntry[] {
  return expressionLibrary.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (!search) return true;
    const query = search.toLowerCase();
    return entry.label.toLowerCase().includes(query) || entry.typst.toLowerCase().includes(query);
  });
}
