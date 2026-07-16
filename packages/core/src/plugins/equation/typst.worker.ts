/// <reference lib="webworker" />

import { createTypstCompiler, FetchPackageRegistry, loadFonts, MemoryAccessModel } from "@myriaddreamin/typst.ts";
import { CompileFormatEnum, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import { withAccessModel, withPackageRegistry } from "@myriaddreamin/typst.ts/options.init";
import * as compilerWrapper from "@myriaddreamin/typst-ts-web-compiler";
import compilerWasm from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import libertinusFont from "@fontsource/libertinus-serif/files/libertinus-serif-latin-400-normal.woff2?url";
import { TypstCompileScheduler } from "./compileScheduler";
import { parseTypstDiagnostics, type TypstCompileRequest, type TypstCompileResponse } from "./workerTypes";

const mainFilePath = "/main.typ";
const packageAccessModel = new MemoryAccessModel();
const packageRegistry = new FetchPackageRegistry(packageAccessModel);
let compilerPromise: Promise<TypstCompiler> | undefined;

const compatibleCompilerWrapper = {
  ...compilerWrapper,
  default: (moduleOrPath?: Parameters<typeof compilerWrapper.default>[0]) =>
    compilerWrapper.default(
      moduleOrPath === undefined || Object.getPrototypeOf(moduleOrPath) === Object.prototype
        ? moduleOrPath
        : { module_or_path: moduleOrPath },
    ),
};

function getCompiler() {
  compilerPromise ??= (async () => {
    const compiler = createTypstCompiler();
    await compiler.init({
      getWrapper: async () => compatibleCompilerWrapper,
      getModule: () => compilerWasm,
      beforeBuild: [
        withAccessModel(packageAccessModel),
        withPackageRegistry(packageRegistry),
        loadFonts([libertinusFont], { assets: ["text"] }),
      ],
    });
    return compiler;
  })();
  return compilerPromise;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Typst compilation error";
  }
}

async function compile(request: TypstCompileRequest) {
  try {
    const compiler = await getCompiler();
    compiler.addSource(mainFilePath, request.source);
    const result = await compiler.compile({
      root: "/",
      mainFilePath,
      format: CompileFormatEnum.vector,
      diagnostics: "unix",
    });
    if (!result.result) {
      const messages = result.diagnostics ?? ["Typst did not produce an artifact."];
      self.postMessage({
        type: "error",
        id: request.id,
        message: messages.join("\n"),
        diagnostics: parseTypstDiagnostics(messages),
      } satisfies TypstCompileResponse);
      return;
    }
    const response = { type: "success", id: request.id, artifact: result.result } satisfies TypstCompileResponse;
    self.postMessage(response, [result.result.buffer]);
  } catch (error) {
    const message = errorMessage(error);
    self.postMessage({
      type: "error",
      id: request.id,
      message,
      diagnostics: parseTypstDiagnostics([message]),
    } satisfies TypstCompileResponse);
  }
}

const scheduler = new TypstCompileScheduler(compile, (request) => {
  self.postMessage({ type: "superseded", id: request.id } satisfies TypstCompileResponse);
});

self.onmessage = (event: MessageEvent<TypstCompileRequest>) => scheduler.enqueue(event.data);

export {};
