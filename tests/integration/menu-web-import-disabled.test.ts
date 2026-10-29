import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WEB_MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import { importRuntime, webImportsOpen } from "@/domain/imports/request";
import { signInCookie } from "../support/merchant";
import { FIXTURE_BOUNDS, FIXTURE_VISION_ENV, fixturePolicy, newImportShop } from "../support/menu-import";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";
import { TEST_BASE_URL } from "../support/session";

// S24 named test 2. This file's process starts with WEB_IMPORTS_ENABLED "false" and an otherwise
// complete FIXTURE configuration, including a bounds entry for the web model, so only the switch can
// refuse. Any fetch at all, to Kernel or to OpenAI, fails the test.
describe("web import with its switch off reaches neither Kernel nor the model", () => {
  let fixture: PaymentsFixture;
  const FIXTURE_WEB_MODEL = "FIXTURE-web-text-model";

  beforeAll(async () => {
    fixture = await createPaymentsFixture("web-import-disabled", { ...FIXTURE_VISION_ENV, WEB_IMPORTS_ENABLED: "false", AI_WEB_MENU_MODEL: FIXTURE_WEB_MODEL, KERNEL_API_KEY: "FIXTURE-kernel-key" });
    importRuntime.policy = fixturePolicy(1_000_000, [FIXTURE_BOUNDS, { ...FIXTURE_BOUNDS, model: FIXTURE_WEB_MODEL }]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  it("the route refuses with web_imports_disabled and the setup page offers no link field", async () => {
    const fetches: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      fetches.push(input instanceof Request ? input.url : String(input));
      throw new Error("FIXTURE: no fetch may happen while web imports are off");
    }) as typeof globalThis.fetch);
    const auth = await import("@/app/api/auth/[...all]/route");
    const web = await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/web/route");
    const shop = await newImportShop(fixture.database, "web-disabled");
    const cookie = await signInCookie(auth.POST, shop.merchant);
    const response = await web.POST(
      new Request(`${TEST_BASE_URL}/api/v1/merchant/outlets/${shop.outletId}/menu-imports/web`, {
        method: "POST",
        headers: { cookie, origin: TEST_BASE_URL, "content-type": "application/json" },
        body: JSON.stringify({ url: "https://fixture-shop.example/menu", consentVersion: WEB_MENU_CONSENT_VERSION, baseRevisionId: shop.revisionId }),
      }),
      routeParams(shop.outletId),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "admission_rejected", details: { reason: "web_imports_disabled" } } });
    const [{ n }] = await fixture.database.admin<[{ n: number }]>`select count(*)::int as n from menu_imports`;
    expect(n).toBe(0);
    expect(fetches).toEqual([]);
    // The setup page renders the link field only while this holds.
    expect(webImportsOpen()).toBe(false);
  });
});
