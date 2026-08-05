import type { TypstCompileRequest } from "./workerTypes";

/** Keeps Typst compilation serial while dropping stale live-preview requests. */
export class TypstCompileScheduler {
  private compiling = false;
  private pendingPreview?: TypstCompileRequest;
  private readonly pendingExact: TypstCompileRequest[] = [];

  constructor(
    private readonly run: (request: TypstCompileRequest) => Promise<void>,
    private readonly supersede: (request: TypstCompileRequest) => void,
  ) {}

  enqueue(request: TypstCompileRequest) {
    if (request.latestOnly) {
      if (this.pendingPreview) this.supersede(this.pendingPreview);
      this.pendingPreview = request;
    } else this.pendingExact.push(request);
    void this.pump();
  }

  private async pump() {
    if (this.compiling) return;
    const request = this.pendingExact.shift() ?? this.pendingPreview;
    if (!request) return;
    if (request === this.pendingPreview) this.pendingPreview = undefined;
    this.compiling = true;
    try {
      await this.run(request);
    } finally {
      this.compiling = false;
      void this.pump();
    }
  }
}
