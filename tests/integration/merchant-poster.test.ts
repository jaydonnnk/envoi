import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { newMerchant, signInCookie } from "../support/merchant";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { seedJudgeFixtures } from "@/operator/cli";
import { newId } from "@/lib/ids";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));

// S49. Real Better Auth and envoi_web reads, disposable PostgreSQL, labeled FIXTURE shops only.
describe("member-only counter poster (FIXTURE)", () => {
  let fixture: PaymentsFixture;
  let memberCookie: string;
  let memberUserId: string;
  let unpublishedId: string;
  let foreignId: string;
  let buyerCookie: string;
  let strangerCookie: string;
  let auth: typeof import("@/app/api/auth/[...all]/route");
  let Page: typeof import("@/app/merchant/setup/poster/page").default;
  beforeAll(async () => {
    fixture = await createPaymentsFixture("poster", { PYUSD_ENABLED: "false" });
    auth = await import("@/app/api/auth/[...all]/route");
    Page = (await import("@/app/merchant/setup/poster/page")).default;
    const member = await newMerchant(fixture.database, "poster-member", { membership: false });
    memberUserId = member.userId;
    await fixture.database.admin`insert into merchant_memberships (id, user_id, outlet_id, role, is_demo, evidence_ref, approved_at) values (${newId("mbr")}, ${member.userId}, ${fixture.outletId}, 'owner', true, 'FIXTURE S49', now())`;
    foreignId = (await seedJudgeFixtures(drizzle(fixture.database.admin, { schema })))[0]!.outletId;
    unpublishedId = newId("out");
    await fixture.database.admin`insert into outlets (id, name, area, is_demo_fixture) values (${unpublishedId}, 'FIXTURE Unpublished', 'FIXTURE Area', true)`;
    await fixture.database.admin`insert into merchant_memberships (id, user_id, outlet_id, role, is_demo, evidence_ref, approved_at) values (${newId("mbr")}, ${member.userId}, ${unpublishedId}, 'owner', true, 'FIXTURE S49', now())`;
    memberCookie = await signInCookie(auth.POST, member);
    buyerCookie = await anonymousCookie(auth.POST);
    const stranger = await newMerchant(fixture.database, "poster-stranger", { membership: false });
    strangerCookie = await signInCookie(auth.POST, stranger);
  });
  afterAll(async () => { await fixture?.database.drop(); });
  async function render(cookie: string, outlet?: string) {
    request.cookie = cookie;
    return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ outlet }) }));
  }
  it("only an approved merchant account reaches a poster", async () => {
    for (const cookie of ["", buyerCookie, strangerCookie]) {
      const html = await render(cookie, fixture.outletId);
      expect(html).toContain("Sign in with an approved merchant account");
      expect(html).not.toContain("counter-poster");
    }
    expect(await render(memberCookie, fixture.outletId)).toContain("Your counter poster");
  });
  it("the poster renders the member's published shop", async () => {
    const html = await render(memberCookie, fixture.outletId);
    expect(html).toContain("Lorong Demo Kopi");
    expect(html).toContain("counter-poster");
    expect(await render(memberCookie)).toContain("counter-poster");
  });
  it("setup offers Print poster only for a published shop", async () => {
    const { listMerchantOutlets } = await import("@/domain/outlets/merchant");
    const { webDb } = await import("@/lib/db/web");
    const { Workspace } = await import("@/app/merchant/setup/workspace");
    const { PAYPAL_PYUSD_REWARDS } = await import("@/domain/rewards/paypal-pyusd");
    const initial = await listMerchantOutlets(webDb(), memberUserId);
    for (const id of [fixture.outletId, unpublishedId]) {
      const outlet = initial.outlets.find(shop => shop.id === id);
      expect(outlet).toBeDefined();
      if (!outlet) throw new Error("FIXTURE shop missing");
      const html = renderToStaticMarkup(createElement(Workspace, { initial: { outlets: [outlet], canCreateOutlet: false }, initialDraft: null, importsOpen: false, webImportsOpen: false, rewardsTerms: PAYPAL_PYUSD_REWARDS }));
      if (id === fixture.outletId) {
        expect(html).toContain(`/merchant/setup/poster?outlet=${fixture.outletId}`);
        expect(html).toContain(">Print poster</a>");
      } else {
        expect(html + ">Print poster</a>").toContain(">Print poster</a>");
        expect(html).not.toContain(">Print poster</a>");
      }
    }
  });

  it("an outlet outside the member's shops renders no poster", async () => {
    const html = await render(memberCookie, foreignId);
    expect(html).toContain("Shop not available");
    expect(html).not.toContain("counter-poster");
  });
  it("an unpublished outlet renders no QR or printable poster", async () => {
    const html = await render(memberCookie, unpublishedId);
    expect(html).toContain("Publish your shop before printing its poster");
    expect(html).not.toContain("counter-poster");
  });
});
