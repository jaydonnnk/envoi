import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { stickerHash } from "@/domain/sgqr/demand";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, shopApi, type MerchantRoutes } from "../support/publication";
import { anonymousCookie } from "../support/session";
import { payNowTemplate, sgqrPayload } from "../support/sgqr";

// S48 stall demand: a buyer's scan of a sticker no published shop has mapped adds one to that week's
// count under a keyed hash, through POST /api/v1/outlets/resolve-sgqr as envoi_web. Every sticker is a
// FIXTURE built tag by tag, every UEN and name is made up, and the key is a FIXTURE value.
const FIXTURE_KEY = "FIXTURE-sticker-hash-key-0123456789abcdef";

describe("stall demand", () => {
  let fixture: PaymentsFixture;
  let routes: MerchantRoutes;
  let resolveRoute: typeof import("@/app/api/v1/outlets/resolve-sgqr/route");

  beforeAll(async () => {
    fixture = await createPaymentsFixture("demand", { STICKER_HASH_KEY: FIXTURE_KEY });
    routes = await loadMerchantRoutes();
    resolveRoute = await import("@/app/api/v1/outlets/resolve-sgqr/route");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  let uenSerial = 0;
  const freshUen = () => `T26DD${String((uenSerial += 1)).padStart(4, "0")}C`;
  const stickerFor = (uen: string, name = "FIXTURE KOPI") => sgqrPayload([payNowTemplate("2", uen)], { name });

  async function scan(cookie: string, payload: string): Promise<{ status: number; body: string }> {
    const response = await resolveRoute.POST(jsonPost("/api/v1/outlets/resolve-sgqr", cookie, { payload }));
    return { status: response.status, body: await response.text() };
  }

  const countFor = async (uen: string) => {
    const rows = await fixture.database.admin<{ count: number }[]>`
      select coalesce(sum(count), 0)::int as count from sticker_scan_counts where sticker_hash = ${stickerHash("paynow_uen", uen, FIXTURE_KEY)}`;
    return rows[0]!.count;
  };

  function captureLogs(): string[] {
    vi.stubEnv("LOG_LEVEL", "debug");
    const output: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }
    return output;
  }

  // A needle counts as present raw, JSON-escaped or with escaped forward slashes.
  const containsNeedle = (text: string, needle: string) => [needle, JSON.stringify(needle).slice(1, -1), JSON.stringify(needle).slice(1, -1).replace(/\//g, "\\/")].some((form) => text.includes(form));

  describe("80 an unenrolled scan stores no name or sticker text", () => {
    it("keeps only a keyed hash, a week and a count, and no row or log line holds the name, UEN, sticker or buyer", async () => {
      const uen = freshUen();
      const marker = `FIXTURE/${randomBytes(6).toString("hex")}"S`;
      const payload = stickerFor(uen, marker);
      const cookie = await anonymousCookie(routes.auth.POST);
      const [session] = await fixture.database.admin<{ userId: string }[]>`select user_id as "userId" from session order by created_at desc limit 1`;
      const buyerId = session!.userId;

      // Scanner self-test on the serialized surfaces read below: a row dump and a log line.
      const planted = [
        JSON.stringify([{ sticker_hash: "0".repeat(64), week: "2026-11-02", count: 1, note: uen }]),
        JSON.stringify([{ sticker_hash: "0".repeat(64), week: "2026-11-02", count: 1, note: marker }]),
        JSON.stringify([{ subject: buyerId }]),
        JSON.stringify({ at: "FIXTURE", level: "info", event: "FIXTURE_self_test", value: payload }).replace(/\//g, "\\/"),
      ];
      expect(containsNeedle(planted[0]!, uen)).toBe(true);
      expect(containsNeedle(planted[1]!, marker)).toBe(true);
      expect(containsNeedle(planted[2]!, buyerId)).toBe(true);
      expect(containsNeedle(planted[3]!, payload)).toBe(true);
      expect(containsNeedle(JSON.stringify([{ sticker_hash: "0".repeat(64), week: "2026-11-02", count: 1 }]), uen)).toBe(false);

      const output = captureLogs();
      const answer = await scan(cookie, payload);
      expect(answer.status).toBe(200);
      expect(JSON.parse(answer.body)).toMatchObject({ data: { resolution: { kind: "no_match" } } });
      // The scan was counted, so the surfaces below are ones actually written.
      expect(await countFor(uen)).toBe(1);
      expect(output.some((line) => line.includes("sgqr_resolution"))).toBe(true);

      const columns = await fixture.database.admin<{ column_name: string }[]>`
        select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sticker_scan_counts' order by column_name`;
      expect(columns.map((row) => row.column_name)).toEqual(["count", "sticker_hash", "week"]);

      const counts = JSON.stringify(await fixture.database.admin`select * from sticker_scan_counts`);
      for (const [surface, text] of [
        ["count rows", counts],
        ["logs", output.join("\n")],
      ] as const) {
        expect(containsNeedle(text, uen), `${surface} UEN`).toBe(false);
        expect(containsNeedle(text, marker), `${surface} stall name`).toBe(false);
        expect(containsNeedle(text, payload), `${surface} sticker text`).toBe(false);
        expect(containsNeedle(text, buyerId), `${surface} buyer`).toBe(false);
      }
    });
  });

  describe("82 one session cannot inflate a count past its limit", () => {
    it("stops counting one buyer's repeated scans at 5, while another buyer still adds one", async () => {
      const uen = freshUen();
      const payload = stickerFor(uen);
      const first = await anonymousCookie(routes.auth.POST);
      for (let i = 0; i < 7; i += 1) expect((await scan(first, payload)).status).toBe(200);
      expect(await countFor(uen)).toBe(5);

      const second = await anonymousCookie(routes.auth.POST);
      expect((await scan(second, payload)).status).toBe(200);
      expect(await countFor(uen)).toBe(6);
    });
  });

  describe("84 a failure to count changes nothing for the buyer", () => {
    it("answers a scan whose count fails exactly as it answers one that is counted", async () => {
      const cookie = await anonymousCookie(routes.auth.POST);
      const counted = await scan(cookie, stickerFor(freshUen()));
      expect(counted.status).toBe(200);

      const uen = freshUen();
      await fixture.database.admin`revoke insert on table sticker_scan_counts from envoi_web`;
      try {
        const output = captureLogs();
        // A thrown error is caught into a value, so a count that escapes fails this assertion, not the run.
        const failed = await scan(cookie, stickerFor(uen)).catch((err: unknown) => ({ status: -1, body: String(err) }));
        expect(failed).toEqual(counted);
        expect(output.some((line) => line.includes("sticker_scan_not_counted") && line.includes("failed"))).toBe(true);
      } finally {
        await fixture.database.admin`grant insert on table sticker_scan_counts to envoi_web`;
      }
      expect(await countFor(uen)).toBe(0);
    });
  });

  describe("the count at enrollment reads as scans", () => {
    it("shows a merchant who submits a scanned UEN how often it was scanned, and nothing for a UEN never scanned", async () => {
      const scanned = freshUen();
      const never = freshUen();
      const buyer = await anonymousCookie(routes.auth.POST);
      for (let i = 0; i < 3; i += 1) expect((await scan(buyer, stickerFor(scanned))).status).toBe(200);

      const api = shopApi(fixture.database, routes);
      const shop = await api.newShop("demand");
      for (const [uen, label] of [
        [scanned, "FIXTURE stall 1"],
        [never, "FIXTURE stall 2"],
      ] as const) {
        expect((await api.patchOutlet(shop, { identifier: { scheme: "paynow_uen", identifier: uen, distinguisher: label, payload: null } })).status).toBe(200);
      }
      const response = await api.patchOutlet(shop, { name: "FIXTURE demand kopi", area: "Tanjong Pagar" });
      expect(response.status).toBe(200);
      const identifiers = (await envelope<{ outlet: { identifiers: { identifier: string; scans: number | null }[] } }>(response)).data.outlet.identifiers;
      expect(identifiers.map(({ identifier, scans }) => ({ identifier, scans }))).toEqual([
        { identifier: scanned, scans: 3 },
        { identifier: never, scans: 0 },
      ]);
    });
  });
});
