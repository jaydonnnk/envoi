import { describe, expect, it } from "vitest";
import { readCountedBody } from "@/lib/http/bounded-body";

// The counted body reader stops at the byte cap, the time bound or the caller's abort, whatever the
// body claims about its own length.
function stream(chunks: Uint8Array[], stayOpen = false): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (!stayOpen) controller.close();
    },
  });
}

const bytes = (n: number) => new Uint8Array(n).fill(120);
const never = new AbortController().signal;

describe("readCountedBody", () => {
  it("returns a body at the cap whole", async () => {
    const result = await readCountedBody(stream([bytes(3), bytes(2)]), 5, 1_000, never);

    expect(result).toEqual({ ok: true, bytes: bytes(5) });
  });

  it("refuses a body one byte over the cap", async () => {
    const result = await readCountedBody(stream([bytes(3), bytes(3)]), 5, 1_000, never);

    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("gives up on a body that stops sending", async () => {
    const started = Date.now();
    const result = await Promise.race([readCountedBody(stream([bytes(1)], true), 5, 50, never), new Promise((resolve) => setTimeout(() => resolve("still reading"), 1_000))]);

    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("stops when the request is aborted", async () => {
    const controller = new AbortController();
    const reading = readCountedBody(stream([bytes(1)], true), 5, 1_000, controller.signal);
    controller.abort();

    expect(await reading).toEqual({ ok: false, reason: "aborted" });
  });
});
