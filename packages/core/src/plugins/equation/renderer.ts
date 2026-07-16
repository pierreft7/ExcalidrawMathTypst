/** Native Typst equation compilation and SVG rendering. */

import { createTypstRenderer, type TypstRenderer } from "@myriaddreamin/typst.ts";
import * as rendererWrapper from "@myriaddreamin/typst-ts-renderer";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/wasm?url";
import TypstCompilerWorker from "./typst.worker?worker";
import type { TypstCompileRequest, TypstCompileResponse, TypstDiagnostic } from "./workerTypes";

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
}

export type EquationRenderer = (
  source: string,
  options?: { fontSize?: number; latestOnly?: boolean },
) => Promise<RenderResult>;

export class TypstRenderError extends Error {
  constructor(message: string, readonly diagnostics: TypstDiagnostic[] = []) {
    super(message);
    this.name = "TypstRenderError";
  }
}

export class TypstRenderSupersededError extends Error {
  constructor() {
    super("A newer Typst preview replaced this request.");
    this.name = "TypstRenderSupersededError";
  }
}

class TypstCompilerClient {
  private readonly worker: Worker;
  private sequence = 0;
  private readonly pending = new Map<number, {
    resolve: (response: TypstCompileResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor(worker = new TypstCompilerWorker()) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<TypstCompileResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      pending.resolve(event.data);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Typst compiler worker failed.");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  async compile(source: string, latestOnly: boolean) {
    const id = ++this.sequence;
    const response = await new Promise<TypstCompileResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "compile", id, source, latestOnly } satisfies TypstCompileRequest);
    });
    if (response.type === "superseded") throw new TypstRenderSupersededError();
    if (response.type === "error") throw new TypstRenderError(response.message, response.diagnostics);
    return response.artifact;
  }
}

let sharedCompiler: TypstCompilerClient | undefined;
let rendererPromise: Promise<TypstRenderer> | undefined;
let renderQueue = Promise.resolve();

const compatibleRendererWrapper = {
  ...rendererWrapper,
  default: (moduleOrPath?: Parameters<typeof rendererWrapper.default>[0]) =>
    rendererWrapper.default(
      moduleOrPath === undefined || Object.getPrototypeOf(moduleOrPath) === Object.prototype
        ? moduleOrPath
        : { module_or_path: moduleOrPath },
    ),
};

function getCompiler() {
  sharedCompiler ??= new TypstCompilerClient();
  return sharedCompiler;
}

function getRenderer() {
  rendererPromise ??= (async () => {
    const renderer = createTypstRenderer();
    await renderer.init({ getWrapper: async () => compatibleRendererWrapper, getModule: () => rendererWasm });
    return renderer;
  })();
  return rendererPromise;
}

export function typstEquationDocument(source: string, fontSize = 24) {
  return [
    "#set page(width: auto, height: auto, margin: 10pt, fill: none)",
    `#set text(font: "Libertinus Serif", size: ${fontSize}pt, fill: rgb("#1e1e1e"))`,
    `#box($ ${source} $)`,
  ].join("\n");
}

async function renderArtifact(artifact: Uint8Array) {
  const render = renderQueue.then(async () => {
    const renderer = await getRenderer();
    return renderer.renderSvg({
      artifactContent: artifact,
      format: "vector",
      data_selection: { body: true, defs: true, css: true, js: false },
    });
  });
  renderQueue = render.then(() => undefined, () => undefined);
  return render;
}

function svgDimensions(svg: string) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new TypstRenderError("Typst produced invalid SVG.");
  const root = parsed.documentElement;
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: Math.max(1, Math.ceil(viewBox[2])), height: Math.max(1, Math.ceil(viewBox[3])) };
  }
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypstRenderError("Typst SVG did not contain usable dimensions.");
  }
  return { width: Math.max(1, Math.ceil(width)), height: Math.max(1, Math.ceil(height)) };
}

/** Compile native Typst math content and return one self-contained SVG. */
export const renderTypstToSvg: EquationRenderer = async (
  source: string,
  options = {},
) => {
  if (!source.trim()) throw new TypstRenderError("Enter a Typst equation.");
  const artifact = await getCompiler().compile(
    typstEquationDocument(source, options.fontSize),
    options.latestOnly ?? false,
  );
  const svg = await renderArtifact(artifact);
  return { svg, ...svgDimensions(svg) };
};

export type { TypstDiagnostic } from "./workerTypes";
