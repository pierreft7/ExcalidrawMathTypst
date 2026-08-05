import { describe, expect, it, vi } from "vitest";
import { TypstCompileScheduler } from "../src/plugins/typst/compileScheduler";
import type { TypstCompileRequest } from "../src/plugins/typst/workerTypes";

function request(id: number, latestOnly = true): TypstCompileRequest {
  return { type: "compile", id, source: String(id), latestOnly };
}

describe("TypstCompileScheduler", () => {
  it("keeps the active compile and only the newest pending preview", async () => {
    const resolvers: Array<() => void> = [];
    const run = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));
    const supersede = vi.fn();
    const scheduler = new TypstCompileScheduler(run, supersede);

    scheduler.enqueue(request(1));
    scheduler.enqueue(request(2));
    scheduler.enqueue(request(3));

    expect(run).toHaveBeenCalledOnce();
    expect(supersede).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    resolvers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("never drops exact insertion or restoration compiles", async () => {
    const order: number[] = [];
    const scheduler = new TypstCompileScheduler(
      async (item) => { order.push(item.id); },
      () => undefined,
    );
    scheduler.enqueue(request(1, false));
    scheduler.enqueue(request(2, false));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([1, 2]);
  });
});
