import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MerchantOutlet } from "@/domain/outlets/merchant";
import * as schema from "@/lib/db/schema";
import { log } from "@/lib/log";
import { approveIdentifier, pendingIdentifiers } from "@/operator/cli";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { FIXTURE_MOBILE, FIXTURE_OTHER_UEN, FIXTURE_UEN, payNowTemplate, sgqrPayload } from "../support/sgqr";

// S9: a merchant submits a sticker's business identifier through the outlet edit route as
// envoi_web, and only the operator CLI approves the mapping. Every payload is a FIXTURE built tag by
// tag; the shops and accounts are FIXTURE data in a disposable database.
describe("merchant SGQR identifier mapping", () => {
  let fixture: PaymentsFixture;
  let routes: MerchantRoutes;
  let api: ReturnType<typeof shopApi>;
  let web: postgres.Sql;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("sgqr");
    routes = await loadMerchantRoutes();
    api = shopApi(fixture.database, routes);
    web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await web?.end({ timeout: 5 });
    await fixture?.database.drop();
  });

  const operatorDb = () => drizzle(fixture.database.admin, { schema });

  type Submission = { scheme?: string; identifier: string; distinguisher?: string; payload?: string | null };
  const submit = (shop: Shop, submission: Submission) =>
    // A guard that let a refused mapping through would either answer 200 or be stopped by the
    // database, which this records as no answer.
    api
      .patchOutlet(shop, { identifier: { scheme: "paynow_uen", distinguisher: "FIXTURE stall 1", payload: null, ...submission } })
      .catch(() => null);

  const rowsOf = (outletId: string) =>
    fixture.database.admin<{ identifier: string; source: string; checksum_valid: boolean | null; approved_at: Date | null }[]>`
      select identifier, source, checksum_valid, approved_at from outlet_identifiers where outlet_id = ${outletId} order by submitted_at, id`;

  it("personal proxy is not published as a business identifier", async () => {
    const shop = await api.newShop("proxy");
    const sticker = sgqrPayload([payNowTemplate("0", FIXTURE_MOBILE)]);

    const refused = await submit(shop, { scheme: "paynow_proxy", identifier: FIXTURE_MOBILE, payload: sticker });
    expect(refused?.status).toBe(400);
    expect((await envelope(refused!)).error).toMatchObject({ code: "validation_failed", details: { reason: "personal_proxy" } });

    expect(await rowsOf(shop.outletId)).toEqual([]);
    expect((await pendingIdentifiers(operatorDb())).filter((row) => row.outletId === shop.outletId)).toEqual([]);
  });

  it("a sticker submission records the server's decode, not the browser's", async () => {
    const shop = await api.newShop("decode");
    const sticker = sgqrPayload([payNowTemplate("2", FIXTURE_UEN)]);

    const fromSticker = await submit(shop, { identifier: FIXTURE_UEN.toLowerCase(), payload: sticker });
    expect(fromSticker?.status).toBe(200);
    const outlet = (await envelope<{ outlet: MerchantOutlet }>(fromSticker!)).data.outlet;
    expect(outlet.identifiers).toEqual([
      { id: expect.any(String), scheme: "paynow_uen", identifier: FIXTURE_UEN, distinguisher: "FIXTURE stall 1", source: "sticker", checksumValid: true, approved: false },
    ]);

    // The same sticker with a UEN it does not carry, a sticker whose checksum fails, and no sticker.
    expect((await submit(shop, { identifier: FIXTURE_OTHER_UEN, payload: sticker }))?.status).toBe(200);
    expect((await submit(shop, { identifier: "53300002F", payload: sgqrPayload([payNowTemplate("2", "53300002F")], { badChecksum: true }) }))?.status).toBe(200);
    expect((await submit(shop, { identifier: "53300003F" }))?.status).toBe(200);
    const notSgqr = await submit(shop, { identifier: "53300004F", payload: "https://example.test/FIXTURE" });
    expect((await envelope(notSgqr!)).error).toMatchObject({ code: "validation_failed", details: { reason: "not_emvco" } });

    expect((await rowsOf(shop.outletId)).map(({ identifier, source, checksum_valid }) => ({ identifier, source, checksum_valid }))).toEqual([
      { identifier: FIXTURE_UEN, source: "sticker", checksum_valid: true },
      { identifier: FIXTURE_OTHER_UEN, source: "corrected", checksum_valid: true },
      { identifier: "53300002F", source: "sticker", checksum_valid: false },
      { identifier: "53300003F", source: "manual", checksum_valid: null },
    ]);
  });

  it("a malformed UEN is not submitted", async () => {
    const shop = await api.newShop("format");
    const refused = await submit(shop, { identifier: "S1234567D" });
    expect((await envelope(refused!)).error).toMatchObject({ code: "validation_failed", details: { reason: "uen_format" } });
    expect(await rowsOf(shop.outletId)).toEqual([]);
  });

  it("a repeated identifier is not submitted twice", async () => {
    const shop = await api.newShop("repeat");
    expect((await submit(shop, { identifier: FIXTURE_UEN }))?.status).toBe(200);
    const repeated = await submit(shop, { identifier: FIXTURE_UEN.toLowerCase(), distinguisher: "FIXTURE stall 2" });
    expect(repeated?.status).toBe(400);
    expect((await envelope(repeated!)).error).toMatchObject({ code: "validation_failed", details: { reason: "identifier_exists" } });
    expect(await rowsOf(shop.outletId)).toHaveLength(1);
  });

  it("a shop submits at most five identifiers", async () => {
    const shop = await api.newShop("limit");
    for (let n = 1; n <= 5; n += 1) expect((await submit(shop, { identifier: `5330001${n}F` }))?.status).toBe(200);
    const sixth = await submit(shop, { identifier: "53300016F" });
    expect((await envelope(sixth!)).error).toMatchObject({ code: "validation_failed", details: { reason: "identifier_limit" } });
    expect(await rowsOf(shop.outletId)).toHaveLength(5);
  });

  it("a body mixing shop details and an identifier is refused whole", async () => {
    const shop = await api.newShop("mixed");
    const mixed = await api.patchOutlet(shop, { name: "FIXTURE renamed", area: "Bugis", detailsConfirmed: true, identifier: { scheme: "paynow_uen", identifier: FIXTURE_UEN, distinguisher: "FIXTURE", payload: null } });
    expect(mixed.status).toBe(400);
    expect(await rowsOf(shop.outletId)).toEqual([]);
    const [outlet] = await fixture.database.admin<{ name: string }[]>`select name from outlets where id = ${shop.outletId}`;
    expect(outlet!.name).not.toBe("FIXTURE renamed");
  });

  it("only the operator approves an identifier mapping", async () => {
    const { shop } = await api.publishedShop("approve");
    expect((await submit(shop, { identifier: FIXTURE_UEN }))?.status).toBe(200);
    const [pending] = await fixture.database.admin<{ id: string }[]>`select id from outlet_identifiers where outlet_id = ${shop.outletId}`;

    // As the web role: a row born approved and an approval after the fact are both refused.
    const bornApproved = web`
      insert into outlet_identifiers (id, outlet_id, scheme, identifier, distinguisher, source, checksum_valid, submitted_by_user_id, submitted_at, approved_at)
      values ('oid_fixture_born_approved', ${shop.outletId}, 'paynow_uen', ${FIXTURE_OTHER_UEN}, 'FIXTURE', 'manual', null, ${shop.merchant.userId}, now(), now())`.then(() => "inserted", (err: { code?: string }) => err.code);
    expect(await bornApproved).toBe("42501");
    const approvedLater = web`update outlet_identifiers set approved_at = now() where id = ${pending!.id}`.then(() => "updated", (err: { code?: string }) => err.code);
    expect(await approvedLater).toBe("42501");
    expect((await rowsOf(shop.outletId)).map((row) => row.approved_at)).toEqual([null]);

    const listed = (await pendingIdentifiers(operatorDb())).filter((row) => row.outletId === shop.outletId);
    expect(listed).toEqual([expect.objectContaining({ identifierId: pending!.id, identifier: FIXTURE_UEN, source: "manual", checksumValid: null })]);
    expect(await approveIdentifier(operatorDb(), { identifierId: pending!.id, evidenceRef: "FIXTURE: test run" })).toMatchObject({ status: "approved" });
    expect(await approveIdentifier(operatorDb(), { identifierId: pending!.id })).toMatchObject({ status: "unchanged" });

    const reread = await routes.outlets.GET(new Request("http://localhost/api/v1/merchant/outlets", { headers: { cookie: shop.cookie } }));
    const outlets = (await envelope<{ outlets: MerchantOutlet[] }>(reread)).data.outlets;
    expect(outlets.find((outlet) => outlet.id === shop.outletId)?.identifiers).toEqual([expect.objectContaining({ identifier: FIXTURE_UEN, approved: true })]);
  });

  it("the database refuses a mapping that is not a business UEN", async () => {
    const shop = await api.newShop("check");
    const inserted = fixture.database.admin`
      insert into outlet_identifiers (id, outlet_id, scheme, identifier, distinguisher, source, checksum_valid, submitted_by_user_id, submitted_at)
      values ('oid_fixture_proxy', ${shop.outletId}, 'paynow_proxy', ${FIXTURE_MOBILE}, 'FIXTURE', 'manual', null, ${shop.merchant.userId}, now())`.then(() => "inserted", (err: { code?: string; constraint_name?: string }) => `${err.code} ${err.constraint_name}`);
    expect(await inserted).toBe("23514 outlet_identifiers_scheme_check");
  });

  // The leak scanner: a needle counts as present raw or JSON-escaped up to three times, which covers
  // escaped quotes, backslashes and slashes.
  function containsNeedle(text: string, needle: string): boolean {
    const candidates = [text];
    for (let depth = 0; depth < 3; depth += 1) candidates.push(candidates.at(-1)!.replace(/\\(["\\/])/g, "$1"));
    return candidates.some((candidate) => candidate.includes(needle));
  }

  it("raw QR payload is not logged", async () => {
    // The merchant name carries a slash and a quote, so the escaped variants differ from the raw one.
    const marker = `FIXTURE/${randomBytes(6).toString("hex")}"Q`;
    const needle = sgqrPayload([payNowTemplate("2", FIXTURE_UEN)], { name: marker });

    // Scanner self-test on the actual serialized log format (one JSON object per line), written
    // without the logger's redaction, which would otherwise hide what the scanner must find.
    const line = (value: string) => JSON.stringify({ at: new Date().toISOString(), level: "info", event: "FIXTURE_scanner_self_test", value });
    const planted = [line(needle), line(JSON.stringify({ body: { identifier: { payload: needle } } })), line(needle).replace(/\//g, "\\/"), line(`decoded ${needle}`)];
    for (const text of planted) {
      expect(containsNeedle(text, needle), text).toBe(true);
      expect(containsNeedle(text, marker), text).toBe(true);
    }
    expect(containsNeedle(line("FIXTURE clean line"), needle)).toBe(false);

    // Every level reaches the sinks, so the route's own log line is a surface actually written.
    vi.stubEnv("LOG_LEVEL", "debug");
    const output: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }

    // Injected: a payload handed straight to the logger, alone and inside other text.
    log("warn", "FIXTURE_planted_payload", { payload: needle, note: `request body ${JSON.stringify({ identifier: { payload: needle } })}` });
    expect(output.some((text) => text.includes("FIXTURE_planted_payload"))).toBe(true);

    // The real route, with the payload in the request body.
    const shop = await api.newShop("leak");
    const response = await submit(shop, { identifier: FIXTURE_UEN, payload: needle });
    const responseText = await response!.text();
    expect(response!.status).toBe(200);
    expect(output.some((text) => text.includes("identifier_submission"))).toBe(true);

    const audit = JSON.stringify(await fixture.database.admin`select * from audit_events where outlet_id = ${shop.outletId}`);
    const rows = JSON.stringify(await fixture.database.admin`select * from outlet_identifiers where outlet_id = ${shop.outletId}`);
    for (const [surface, text] of [
      ["logs", output.join("\n")],
      ["response", responseText],
      ["audit rows", audit],
      ["identifier rows", rows],
    ] as const) {
      expect(containsNeedle(text, needle), surface).toBe(false);
      expect(containsNeedle(text, marker), `${surface} merchant name`).toBe(false);
    }
  });

  it("a merchant cannot submit an identifier for another shop", async () => {
    const other = await api.newShop("stranger");
    const response = await routes.outlet.PATCH(
      new Request(`http://localhost/api/v1/merchant/outlets/${fixture.outletId}`, {
        method: "PATCH",
        headers: { cookie: other.cookie, "content-type": "application/json" },
        body: JSON.stringify({ identifier: { scheme: "paynow_uen", identifier: FIXTURE_UEN, distinguisher: "FIXTURE", payload: null } }),
      }),
      routeParams(fixture.outletId),
    );
    expect(response.status).toBe(403);
    expect(await rowsOf(fixture.outletId)).toEqual([]);
  });
});
