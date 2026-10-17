import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { approveIdentifier } from "@/operator/cli";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";
import { payNowTemplate, sgqrPayload, tlv } from "../support/sgqr";

// S10: a buyer's scanned or pasted sticker resolves through POST /api/v1/outlets/resolve-sgqr as
// envoi_web. Every sticker is a FIXTURE built tag by tag, every UEN is made up, and the shops,
// merchants and mappings are FIXTURE data in a disposable database, approved as the operator CLI
// would approve them.
describe("buyer SGQR resolution", () => {
  let fixture: PaymentsFixture;
  let routes: MerchantRoutes;
  let api: ReturnType<typeof shopApi>;
  let resolveRoute: typeof import("@/app/api/v1/outlets/resolve-sgqr/route");
  let buyer: string;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("resolve");
    routes = await loadMerchantRoutes();
    api = shopApi(fixture.database, routes);
    resolveRoute = await import("@/app/api/v1/outlets/resolve-sgqr/route");
    buyer = await anonymousCookie(routes.auth.POST);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const operatorDb = () => drizzle(fixture.database.admin, { schema });

  // A made-up business-entity UEN per call (T, a 2-digit year, a 2-letter type, 4 digits, a letter),
  // so no two cases share one unless they mean to.
  let uenSerial = 0;
  const freshUen = () => `T26LL${String((uenSerial += 1)).padStart(4, "0")}B`;

  // The merchant submits the mapping through the outlet edit route; the operator approves it unless
  // the case says otherwise.
  async function mapIdentifier(shop: Shop, uen: string, distinguisher: string, { approve = true } = {}): Promise<void> {
    const response = await api.patchOutlet(shop, { identifier: { scheme: "paynow_uen", identifier: uen, distinguisher, payload: null } });
    expect(response.status).toBe(200);
    if (!approve) return;
    const [row] = await fixture.database.admin<{ id: string }[]>`select id from outlet_identifiers where outlet_id = ${shop.outletId} and identifier = ${uen}`;
    expect(await approveIdentifier(operatorDb(), { identifierId: row!.id, evidenceRef: "FIXTURE: S10 test run" })).toMatchObject({ status: "approved" });
  }

  const stickerFor = (uen: string, options: Parameters<typeof sgqrPayload>[1] = {}) => sgqrPayload([payNowTemplate("2", uen)], options);

  async function resolveRaw(body: unknown, cookie: string | null = buyer): Promise<Response> {
    const request = cookie
      ? jsonPost("/api/v1/outlets/resolve-sgqr", cookie, body)
      : new Request(`${TEST_BASE_URL}/api/v1/outlets/resolve-sgqr`, { method: "POST", headers: { "content-type": "application/json", origin: TEST_BASE_URL }, body: JSON.stringify(body) });
    return resolveRoute.POST(request);
  }

  async function resolve(payload: string): Promise<unknown> {
    const response = await resolveRaw({ payload });
    expect(response.status).toBe(200);
    return (await envelope<{ resolution: unknown }>(response)).data.resolution;
  }

  const summaryOf = async (shop: Shop) => {
    const [row] = await fixture.database.admin<{ id: string; name: string; area: string; isDemoFixture: boolean }[]>`
      select id, name, area, is_demo_fixture as "isDemoFixture" from outlets where id = ${shop.outletId}`;
    return row!;
  };

  const tableCounts = async () => {
    const [row] = await fixture.database.admin<Record<string, number>[]>`
      select (select count(*)::int from outlets) as outlets,
             (select count(*)::int from enrollments) as enrollments,
             (select count(*)::int from merchant_memberships) as memberships,
             (select count(*)::int from outlet_identifiers) as identifiers,
             (select count(*)::int from purchases) as purchases,
             (select count(*)::int from payment_destinations) as destinations`;
    return row!;
  };

  it("unenrolled sticker yields no purchase", async () => {
    const before = await tableCounts();
    expect(await resolve(stickerFor(freshUen()))).toEqual({ kind: "no_match" });
    expect(await tableCounts()).toEqual(before);
  });

  it("shared identifier asks which outlet", async () => {
    const shared = freshUen();
    // Created in the opposite order to their names: candidates come back by name, never by creation,
    // distance or any other guess at which one the buyer is at.
    const { shop: second } = await api.publishedShop("shared-zeta");
    const { shop: first } = await api.publishedShop("shared-alpha");
    await mapIdentifier(second, shared, "FIXTURE stall 2, level 2");
    await mapIdentifier(first, shared, "FIXTURE stall 1, level 1");

    expect(await resolve(stickerFor(shared))).toEqual({
      kind: "ambiguous",
      candidates: [
        { ...(await summaryOf(first)), distinguisher: "FIXTURE stall 1, level 1" },
        { ...(await summaryOf(second)), distinguisher: "FIXTURE stall 2, level 2" },
      ],
    });
  });

  // Every key in a JSON value, at any depth.
  function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value && typeof value === "object") return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
    return [];
  }

  it("scan grants no destination and no rail", async () => {
    const solo = freshUen();
    const { shop } = await api.publishedShop("solo");
    await mapIdentifier(shop, solo, "FIXTURE only outlet");
    const shared = freshUen();
    const { shop: east } = await api.publishedShop("grant-east");
    const { shop: west } = await api.publishedShop("grant-west");
    await mapIdentifier(east, shared, "FIXTURE east entrance");
    await mapIdentifier(west, shared, "FIXTURE west entrance");

    const single = await resolve(stickerFor(solo));
    expect(single).toEqual({ kind: "single", outlet: await summaryOf(shop) });
    const ambiguous = await resolve(stickerFor(shared));
    expect(ambiguous).toMatchObject({ kind: "ambiguous" });

    // Each shop has an accepted PayPal destination, so a resolution that leaked one would carry it.
    for (const resolution of [single, ambiguous]) {
      const text = JSON.stringify(resolution);
      expect(text).not.toContain(FIXTURE_SELLER);
      expect(keysOf(resolution).filter((key) => /payee|destination|rail|seller|merchant|enrol|paypal|pyusd|price|amount/i.test(key))).toEqual([]);
    }
    expect(new Set(keysOf(single))).toEqual(new Set(["kind", "outlet", "id", "name", "area", "isDemoFixture"]));
    expect(new Set(keysOf(ambiguous))).toEqual(new Set(["kind", "candidates", "id", "name", "area", "isDemoFixture", "distinguisher"]));
  });

  it("a pending mapping does not resolve", async () => {
    const pending = freshUen();
    const { shop } = await api.publishedShop("pending");
    await mapIdentifier(shop, pending, "FIXTURE awaiting the operator", { approve: false });
    expect(await resolve(stickerFor(pending))).toEqual({ kind: "no_match" });
  });

  it("an unpublished outlet does not resolve", async () => {
    const unpublished = freshUen();
    const shop = await api.newShop("unpublished");
    await mapIdentifier(shop, unpublished, "FIXTURE not yet published");
    expect(await resolve(stickerFor(unpublished))).toEqual({ kind: "no_match" });
  });

  it("a personal proxy does not resolve, even when it reads like a UEN", async () => {
    const uen = freshUen();
    const { shop } = await api.publishedShop("proxy-lookalike");
    await mapIdentifier(shop, uen, "FIXTURE mapped outlet");
    // Proxy type 0 is a mobile number; this sticker carries the mapped UEN's text in that slot.
    expect(await resolve(sgqrPayload([payNowTemplate("0", uen)]))).toEqual({ kind: "unsupported_payload", unrecognizedCount: 0 });
  });

  it("a misread sticker does not resolve", async () => {
    const uen = freshUen();
    const { shop } = await api.publishedShop("misread");
    await mapIdentifier(shop, uen, "FIXTURE mapped outlet");
    expect(await resolve(stickerFor(uen, { badChecksum: true }))).toEqual({ kind: "unsupported_payload", unrecognizedCount: 0 });
  });

  it("a code with no business identifier is unsupported, not unenrolled", async () => {
    expect(await resolve("https://example.test/FIXTURE-not-a-sticker")).toEqual({ kind: "unsupported_payload", unrecognizedCount: 0 });
    // An SGQR with only a merchant account template Envoi does not read.
    const otherScheme = sgqrPayload([tlv("27", tlv("00", "SG.FIXTURE.OTHER") + tlv("01", "FIXTURE-0001"))]);
    expect(await resolve(otherScheme)).toEqual({ kind: "unsupported_payload", unrecognizedCount: 1 });
  });

  it("the sticker contents are bounded", async () => {
    const cases: Array<[string, unknown]> = [
      ["empty", { payload: "" }],
      ["blank", { payload: "   " }],
      ["oversize", { payload: `000201${"9".repeat(507)}` }],
      ["not a string", { payload: 12 }],
      ["extra field", { payload: stickerFor(freshUen()), area: "Tanjong Pagar" }],
      ["no payload", {}],
    ];
    for (const [label, body] of cases) {
      const response = await resolveRaw(body);
      expect(response.status, label).toBe(400);
      expect((await envelope(response)).error.code, label).toBe("validation_failed");
    }
    const notJson = await resolveRoute.POST(new Request(`${TEST_BASE_URL}/api/v1/outlets/resolve-sgqr`, { method: "POST", headers: { cookie: buyer, "content-type": "application/json" }, body: "000201{" }));
    expect(notJson.status).toBe(400);
  });

  it("a buyer session is required", async () => {
    const response = await resolveRaw({ payload: stickerFor(freshUen()) }, null);
    expect(response.status).toBe(401);
    expect((await envelope(response)).error.code).toBe("unauthorized");
  });

  // The S9 leak scanner: a needle counts as present raw or JSON-escaped up to three times, which
  // covers escaped quotes, backslashes and slashes.
  function containsNeedle(text: string, needle: string): boolean {
    const candidates = [text];
    for (let depth = 0; depth < 3; depth += 1) candidates.push(candidates.at(-1)!.replace(/\\(["\\/])/g, "$1"));
    return candidates.some((candidate) => candidate.includes(needle));
  }

  it("raw QR payload is not logged by the scan route", async () => {
    const uen = freshUen();
    const { shop } = await api.publishedShop("leak");
    await mapIdentifier(shop, uen, "FIXTURE leak outlet");
    // The merchant name carries a slash and a quote, so the escaped variants differ from the raw one.
    const marker = `FIXTURE/${randomBytes(6).toString("hex")}"S`;
    const needle = stickerFor(uen, { name: marker });

    // Scanner self-test on the actual serialized formats: a log line and a response envelope.
    const line = (value: unknown) => JSON.stringify({ at: new Date().toISOString(), level: "info", event: "FIXTURE_scanner_self_test", value });
    const planted = [line(needle), line({ payload: needle }), line(needle).replace(/\//g, "\\/"), JSON.stringify({ ok: true, data: { resolution: { kind: "single" }, payload: needle } })];
    for (const text of planted) {
      expect(containsNeedle(text, needle), text).toBe(true);
      expect(containsNeedle(text, marker), text).toBe(true);
    }
    expect(containsNeedle(line("FIXTURE clean line"), needle)).toBe(false);

    vi.stubEnv("LOG_LEVEL", "debug");
    const output: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }

    const auditBefore = await fixture.database.admin<{ count: number }[]>`select count(*)::int as count from audit_events`;
    const resolved = await resolveRaw({ payload: needle });
    const refused = await resolveRaw({ payload: needle + "9".repeat(600) });
    const resolvedText = await resolved.text();
    const refusedText = await refused.text();
    expect(resolved.status).toBe(200);
    expect(JSON.parse(resolvedText)).toMatchObject({ data: { resolution: { kind: "single" } } });
    expect(refused.status).toBe(400);
    // The route's own log line is a surface actually written.
    expect(output.some((text) => text.includes("sgqr_resolution"))).toBe(true);

    const auditAfter = await fixture.database.admin<{ count: number }[]>`select count(*)::int as count from audit_events`;
    expect(auditAfter[0]!.count).toBe(auditBefore[0]!.count);
    const audit = JSON.stringify(await fixture.database.admin`select * from audit_events`);
    for (const [surface, text] of [
      ["logs", output.join("\n")],
      ["resolved response", resolvedText],
      ["refused response", refusedText],
      ["audit rows", audit],
    ] as const) {
      expect(containsNeedle(text, needle), surface).toBe(false);
      expect(containsNeedle(text, marker), `${surface} merchant name`).toBe(false);
    }
  });
});
