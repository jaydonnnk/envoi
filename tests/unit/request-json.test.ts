import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/browser/session";

// The merchant setup page's request helper. A request that never got a response must resolve as a
// failure the page can show, never reject unhandled and leave the page blank.
describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a network failure resolves as a failed result instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(requestJson("GET", "/api/v1/merchant/outlets/out_fixture/menu-draft")).resolves.toEqual({ status: 0, ok: false });
  });

  it("an error answer resolves with its status and error envelope", async () => {
    const envelope = { ok: false, error: { code: "revision_conflict", message: "This menu changed since you loaded it." } };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(envelope), { status: 409 }))));
    await expect(requestJson("PUT", "/api/v1/merchant/outlets/out_fixture/menu-draft", {})).resolves.toEqual({ status: 409, ok: false, data: undefined, error: envelope.error });
  });
});
