import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RewardsCardView } from "@/app/merchant/setup/rewards-card";
import { illustrateOneYear, PAYPAL_PYUSD_REWARDS, rewardsCard } from "@/domain/rewards/paypal-pyusd";
import { connectWeb, type Db } from "@/lib/db/web";
import { money } from "@/lib/money";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S28: the PayPal PYUSD rewards card. FIXTURE outlets, purchases and attempts are written directly
// as the superuser; the card is read as envoi_web, the role the app runs as. No PayPal call exists.
//
// NOW is 2026-11-01 03:30 UTC: still 31 Oct in New York (UTC-4 until 06:00 UTC that day) but
// already 1 Nov in Singapore, so one capture instant falls in different months for the two shops.
const NOW = new Date("2026-11-01T03:30:00Z");

describe("the PayPal PYUSD rewards card", () => {
  let database: TestDatabase;
  let web: { db: Db; close: () => Promise<void> };
  let attempt = 0;

  async function paid(outletId: string, revisionId: string, currency: "SGD" | "USD", minor: number, verifiedAt: string, state = "capture_confirmed") {
    attempt += 1;
    const sql = database.admin;
    const purchaseId = `pur_fixture_s28_${attempt}`;
    await sql`insert into purchases (id, buyer_user_id, outlet_id, menu_revision_id, state, entry_point, lines, total_minor, currency, review_expires_at)
      values (${purchaseId}, 'usr_fixture_s28', ${outletId}, ${revisionId}, ${state === "capture_confirmed" ? "paid" : "uncertain"}, 'fixture_tracer', '[]', ${minor}, ${currency}, now())`;
    await sql`insert into payment_attempts (id, purchase_id, rail, state, payee_merchant_id, total_minor, currency, create_request_id, capture_request_id, capture_id, capture_gross_minor, capture_verified_at)
      values (${`att_fixture_s28_${attempt}`}, ${purchaseId}, 'paypal', ${state}, 'FXTRSELLER2AB', ${minor}, ${currency}, ${`fixture-create-s28-${attempt}`}, ${`fixture-capture-s28-${attempt}`},
        ${`FIXTURE-CAPTURE-S28-${attempt}`}, ${minor}, ${verifiedAt})`;
  }

  beforeAll(async () => {
    database = await createTestDatabase("rewards");
    const sql = database.admin;
    await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('usr_fixture_s28', 'FIXTURE buyer', 'fixture-s28@buyer.example.test', false, now(), now())`;
    await sql`insert into outlets (id, name, area, is_demo_fixture, country) values ('out_fixture_s28sg', 'FIXTURE Kopi', 'Tanjong Pagar', true, 'SG'), ('out_fixture_s28us', 'FIXTURE Diner', 'San Francisco', true, 'US')`;
    await sql`insert into menu_revisions (id, outlet_id, status, confirmed_at) values ('mrv_fixture_s28sg', 'out_fixture_s28sg', 'confirmed', now()), ('mrv_fixture_s28us', 'out_fixture_s28us', 'confirmed', now())`;

    // Singapore: 31 Oct 20:00 UTC is 1 Nov 04:00 there, so it counts; 31 Oct 15:00 UTC is 23:00 on 31 Oct, so it does not.
    await paid("out_fixture_s28sg", "mrv_fixture_s28sg", "SGD", 440, "2026-10-31T20:00:00Z");
    await paid("out_fixture_s28sg", "mrv_fixture_s28sg", "SGD", 999, "2026-10-31T15:00:00Z");
    // New York: 1 Oct 05:00 UTC is 1 Oct 01:00 there and 31 Oct 20:00 UTC is 16:00 on 31 Oct, so both count;
    // 1 Oct 03:00 UTC is still 30 Sep there, so it does not.
    await paid("out_fixture_s28us", "mrv_fixture_s28us", "USD", 4000, "2026-10-01T05:00:00Z");
    await paid("out_fixture_s28us", "mrv_fixture_s28us", "USD", 2420, "2026-10-31T20:00:00Z");
    await paid("out_fixture_s28us", "mrv_fixture_s28us", "USD", 700, "2026-10-01T03:00:00Z");
    // Never counted: an uncertain capture, and one verified after NOW in the same New York month (31 Oct 23:45 there).
    await paid("out_fixture_s28us", "mrv_fixture_s28us", "USD", 300, "2026-10-20T12:00:00Z", "capture_unknown");
    await paid("out_fixture_s28us", "mrv_fixture_s28us", "USD", 500, "2026-11-01T03:45:00Z");
    web = connectWeb(database.webUrl, 1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await web?.close();
    await database?.drop();
  });

  it("the rewards card counts confirmed captures this month in the outlet's time zone", async () => {
    const sg = await rewardsCard(web.db, "out_fixture_s28sg", NOW);
    expect(sg.paidThisMonth).toEqual(money("SGD", 440));
    const us = await rewardsCard(web.db, "out_fixture_s28us", NOW);
    expect(us.paidThisMonth).toEqual(money("USD", 6420));
    // An outlet with nothing paid reads zero in its own currency, not unknown.
    await database.admin`insert into outlets (id, name, area, is_demo_fixture, country) values ('out_fixture_s28none', 'FIXTURE Empty', 'Austin', true, 'US')`;
    expect((await rewardsCard(web.db, "out_fixture_s28none", NOW)).paidThisMonth).toEqual(money("USD", 0));
  });

  it("the rewards illustration appears for US outlets only and rounds down", async () => {
    // 6420 * 400 / 10000 = 256.8, shown as US$2.56, never US$2.57.
    expect(illustrateOneYear(money("USD", 6420), 400)).toEqual(money("USD", 256));
    expect(illustrateOneYear(money("USD", 24), 400)).toEqual(money("USD", 0));
    const us = await rewardsCard(web.db, "out_fixture_s28us", NOW);
    expect(us).toMatchObject({ country: "US", eligible: true, illustration: money("USD", 256) });
    const sg = await rewardsCard(web.db, "out_fixture_s28sg", NOW);
    expect(sg).toMatchObject({ country: "SG", eligible: false, illustration: null });

    const usHtml = renderToStaticMarkup(RewardsCardView({ card: us, terms: PAYPAL_PYUSD_REWARDS }));
    expect(usHtml).toContain("Illustration only: US$64.20 held as PYUSD for a year at 4% would earn about US$2.56.");
    expect(usHtml).toContain("29 Oct 2026");
    const sgHtml = renderToStaticMarkup(RewardsCardView({ card: sg, terms: PAYPAL_PYUSD_REWARDS }));
    expect(sgHtml).toContain("Singapore businesses cannot earn them yet.");
    expect(sgHtml).not.toContain("Illustration only");
    expect(sgHtml).not.toContain("4%");
  });

  it("the rewards card makes no network call", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("the rewards card must not fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);
    for (const outletId of ["out_fixture_s28sg", "out_fixture_s28us"]) {
      const card = await rewardsCard(web.db, outletId, NOW);
      renderToStaticMarkup(RewardsCardView({ card, terms: PAYPAL_PYUSD_REWARDS }));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
