import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S43 decisions 1, 10 and 12: the merchant setup page renders the sign-up form, the shop form and
// the sign-up lead only while MERCHANT_SIGNUP_ENABLED is "true". The session and the membership are
// FIXTURE stand-ins at the auth boundary; the page reads no database on these paths.
const state = vi.hoisted(() => ({
  signup: undefined as string | undefined,
  session: null as null | { user: { isAnonymous: boolean; name: string; email: string } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/env")>()),
  webEnv: () => ({ MERCHANT_SIGNUP_ENABLED: state.signup }),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => state.session } }) }));
vi.mock("@/lib/auth-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-context")>()),
  requireMerchantMembership: async () => ({ code: "forbidden_membership", message: "FIXTURE no membership" }),
}));
// The handle may be passed along, but any use of it fails the test.
vi.mock("@/lib/db/web", () => ({
  webDb: () =>
    new Proxy(
      {},
      {
        get() {
          throw new Error("the setup page read the database on a sign-up path");
        },
      },
    ),
}));

const { default: MerchantSetupPage } = await import("@/app/merchant/setup/page");
const render = async () => renderToStaticMarkup(await MerchantSetupPage());

const SIGNUP_LEAD = "Test environment. Nothing here takes real money. An Envoi admin approves every shop before it can sell.";
const RECOVERY = "No confirmation email is sent, and a lost password cannot be reset in this test environment.";

describe("the setup page follows MERCHANT_SIGNUP_ENABLED", () => {
  beforeEach(() => {
    state.signup = undefined;
    state.session = null;
  });

  it.each([undefined, "false"])("signed out with the switch %s: sign-in only, no sign-up form", async (value) => {
    state.signup = value;
    const markup = await render();
    expect(markup).toContain("<h1>Sign in to set up your shop</h1>");
    expect(markup).toContain("There is no public sign-up.");
    expect(markup).not.toContain("Create your account");
    expect(markup).not.toContain('name="seller"');
    expect(markup).not.toContain(RECOVERY);
  });

  it("signed out with the switch on: the sign-up card with its fields and lines beside the sign-in card", async () => {
    state.signup = "true";
    const markup = await render();
    expect(markup).toContain("<h1>Set up your shop</h1>");
    expect(markup).toContain(SIGNUP_LEAD);
    expect(markup).toContain("Create your account");
    for (const field of ['name="email"', 'name="password"', 'name="name"', 'name="area"', 'name="seller"']) expect(markup).toContain(field);
    expect(markup).toContain(RECOVERY);
    expect(markup).toContain("The admin reviews this before connecting it. It is not used until then.");
    expect(markup).toContain("Create account and shop");
    expect(markup).toContain("Already have an account?");
    expect(markup).not.toContain("There is no public sign-up.");
  });

  it("signed in with no membership: the shop form only with the switch on", async () => {
    state.session = { user: { isAnonymous: false, name: "FIXTURE owner", email: "owner@signup.example.test" } };
    state.signup = "false";
    const off = await render();
    expect(off).toContain("<h1>No approved membership</h1>");
    expect(off).not.toContain('name="seller"');

    state.signup = "true";
    const on = await render();
    expect(on).toContain("Create your shop");
    expect(on).toContain('name="seller"');
    expect(on).not.toContain('name="password"');
    expect(on).not.toContain("No approved membership");
  });
});
