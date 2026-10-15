import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importRuntime } from "@/domain/imports/request";
import { signInCookie } from "../support/merchant";
import { FIXTURE_VISION_ENV, countedStream, createFakeVision, fixturePolicy, importRequest, newImportShop, photoBody, solidJpeg } from "../support/menu-import";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";

// S11: the import kill switch. This file's process starts with MENU_IMPORTS_ENABLED "false" and an
// otherwise complete FIXTURE configuration, so only the flag can refuse. Part of the group
// "import route refusals read no body"; the other three cases are in menu-import-route.test.ts.
describe("import route refusals read no body", () => {
  let fixture: PaymentsFixture;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("import-disabled", { ...FIXTURE_VISION_ENV, MENU_IMPORTS_ENABLED: "false" });
    importRuntime.policy = fixturePolicy();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  it("imports refuse while disabled", async () => {
    const fake = createFakeVision(() => {
      throw new Error("FIXTURE fake OpenAI must not be called while imports are disabled");
    });
    vi.stubGlobal("fetch", fake.fetch);
    const auth = await import("@/app/api/auth/[...all]/route");
    const imports = await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route");
    const shop = await newImportShop(fixture.database, "disabled");
    const cookie = await signInCookie(auth.POST, shop.merchant);
    const body = countedStream(photoBody(await solidJpeg()));
    const response = await imports.POST(importRequest(shop.outletId, cookie, body.stream, { baseRevisionId: shop.revisionId }), routeParams(shop.outletId));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "admission_rejected", details: { reason: "imports_disabled" } } });
    const [{ n }] = await fixture.database.admin<[{ n: number }]>`select count(*)::int as n from menu_imports`;
    expect(n).toBe(0);
    expect(body.pulls()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});
