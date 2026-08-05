export interface TypstDiagnostic {
  severity: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
}

export interface TypstCompileRequest {
  type: "compile";
  id: number;
  source: string;
  latestOnly: boolean;
}

export type TypstCompileResponse =
  | { type: "success"; id: number; artifact: Uint8Array }
  | { type: "superseded"; id: number }
  | { type: "error"; id: number; message: string; diagnostics: TypstDiagnostic[] };

export function parseTypstDiagnostics(messages: string[]): TypstDiagnostic[] {
  return messages.map((raw) => {
    const match = /(?:^|\s)\/main\.typ:(\d+):(\d+):\s*(.*)$/s.exec(raw.trim());
    const message = match?.[3] || raw.trim() || "Typst compilation failed.";
    const warning = /^(?:warning|warn)\s*:/i.test(message);
    return {
      severity: warning ? "warning" : "error",
      message: message.replace(/^(?:error|warning|warn)\s*:\s*/i, ""),
      line: match ? Number(match[1]) : undefined,
      column: match ? Number(match[2]) : undefined,
    };
  });
}
