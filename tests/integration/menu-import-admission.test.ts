import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitMenuImport, modelConfigVersion } from "@/domain/imports/admission";
import { closeImportFailed, markModelDispatched } from "@/domain/imports/lifecycle";
import type { AdmissionLimits, MenuSpendPolicy } from "@/domain/imports/types";
import { connectWeb, type Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { FIXTURE_BOUNDS, FIXTURE_RESERVATION, FIXTURE_VISION_ENV, FIXTURE_VISION_MODEL, fixturePolicy, newImportShop, type ImportShop } from "../support/menu-import";

// S11: admitMenuImport as envoi_web against a migrated disposable database. Limits and the spend
// policy are injected so each case isolates one guard, and each case runs on its own UTC day, so no
// case sees another's attempts. FIXTURE bounds reserve US$0.005 a call.

const ISOLATED: AdmissionLimits = { outletInFlight: 100, globalInFlight: 100, outletDaily: 1_000, globalDaily: 1_000 };
const CONFIG = modelConfigVersion(FIXTURE_BOUNDS);

describe("menu import admission", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;
  let day = 0;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("admission", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 10));
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  // A fresh UTC day for each case: midday, so a 90-second deadline never crosses midnight.
  const nextDay = () => new Date(Date.UTC(2027, 0, 1 + ++day, 12, 0, 0));
  const later = (from: Date, ms: number) => new Date(from.getTime() + ms);

  const admit = (shop: ImportShop, now: Date, overrides: { limits?: AdmissionLimits; policy?: MenuSpendPolicy; model?: string } = {}) =>
    admitMenuImport(db, {
      outletId: shop.outletId,
      actorUserId: shop.merchant.userId,
      consentVersion: "FIXTURE-consent",
      baseRevisionId: shop.revisionId,
      model: overrides.model ?? FIXTURE_VISION_MODEL,
      limits: overrides.limits ?? ISOLATED,
      policy: overrides.policy ?? fixturePolicy(),
      now,
    });

  // A past attempt written as the superuser: closed with an outcome, or open, with or without the
  // dispatch mark.
  async function pastAttempt(shop: ImportShop, admittedAt: Date, fields: { outcome?: string | null; dispatched?: boolean; actual?: number | null; config?: string } = {}) {
    const outcome = fields.outcome === undefined ? "completed" : fields.outcome;
    const deadline = later(admittedAt, 90_000);
    await fixture.database.admin`
      insert into menu_imports (id, outlet_id, actor_user_id, base_revision_id, consent_version, model_config_version,
        admitted_at, deadline_at, model_dispatched_at, closed_at, closed_outcome, reserved_usd_micros, actual_usd_micros)
      values (${newId("imp")}, ${shop.outletId}, ${shop.merchant.userId}, ${shop.revisionId}, 'FIXTURE-consent', ${fields.config ?? CONFIG},
        ${admittedAt.toISOString()}, ${deadline.toISOString()}, ${fields.dispatched ? later(admittedAt, 1_000).toISOString() : null},
        ${outcome === null ? null : later(admittedAt, 2_000).toISOString()},
        ${outcome}, ${FIXTURE_RESERVATION}, ${fields.actual ?? null})`;
  }

  const openRows = async (outletIds: string[]) =>
    (await fixture.database.admin<{ n: number }[]>`select count(*)::int as n from menu_imports where outlet_id = any(${outletIds}) and closed_at is null`)[0]!.n;

  it("second live import for an outlet is refused", async () => {
    const shop = await newImportShop(fixture.database, "live-outlet");
    const now = nextDay();
    const limits = { ...ISOLATED, outletInFlight: 1, globalInFlight: 2 };
    expect((await admit(shop, now, { limits })).ok).toBe(true);
    expect(await admit(shop, later(now, 1_000), { limits })).toEqual({ ok: false, reason: "in_flight_outlet" });
  });

  it("second live import anywhere is refused", async () => {
    const [a, b] = [await newImportShop(fixture.database, "live-a"), await newImportShop(fixture.database, "live-b")];
    const now = nextDay();
    const limits = { ...ISOLATED, outletInFlight: 1, globalInFlight: 1 };
    expect((await admit(a, now, { limits })).ok).toBe(true);
    expect(await admit(b, later(now, 1_000), { limits })).toEqual({ ok: false, reason: "in_flight_global" });
  });

  it("eleventh import for an outlet in a UTC day is refused", async () => {
    const shop = await newImportShop(fixture.database, "eleventh");
    const now = nextDay();
    for (let n = 0; n < 10; n += 1) await pastAttempt(shop, later(now, -3_600_000 + n * 60_000));
    expect(await admit(shop, now, { limits: { ...ISOLATED, outletDaily: 10 } })).toEqual({ ok: false, reason: "daily_cap_outlet" });
  });

  it("fifty-first import in a UTC day is refused", async () => {
    const now = nextDay();
    for (let s = 0; s < 5; s += 1) {
      const shop = await newImportShop(fixture.database, `fifty-${s}`);
      for (let n = 0; n < 10; n += 1) await pastAttempt(shop, later(now, -3_600_000 + n * 60_000));
    }
    const last = await newImportShop(fixture.database, "fifty-first");
    expect(await admit(last, now, { limits: { ...ISOLATED, globalDaily: 50 } })).toEqual({ ok: false, reason: "daily_cap_global" });
  });

  it("failed and aborted attempts count toward daily caps", async () => {
    const shop = await newImportShop(fixture.database, "failed-count");
    const now = nextDay();
    const outcomes = ["rejected_upload", "rejected_photo", "model_failed", "model_timeout", "output_invalid", "aborted", "aborted", "model_failed", "rejected_photo", "conflict_base_revision"];
    for (const [n, outcome] of outcomes.entries()) await pastAttempt(shop, later(now, -3_600_000 + n * 60_000), { outcome });
    expect(await admit(shop, now, { limits: { ...ISOLATED, outletDaily: 10 } })).toEqual({ ok: false, reason: "daily_cap_outlet" });
  });

  it("daily caps reset at UTC midnight", async () => {
    const shop = await newImportShop(fixture.database, "midnight");
    nextDay();
    const midnight = nextDay();
    midnight.setUTCHours(0, 0, 0, 0);
    // Ten attempts at 07:30 SGT, which is 23:30 UTC on the earlier UTC day.
    for (let n = 0; n < 10; n += 1) await pastAttempt(shop, later(midnight, -30 * 60_000 + n * 1_000));
    const limits = { ...ISOLATED, outletDaily: 10 };
    // 07:59 SGT is 23:59 UTC: still the earlier UTC day.
    expect(await admit(shop, later(midnight, -60_000), { limits })).toEqual({ ok: false, reason: "daily_cap_outlet" });
    // 08:00 SGT is 00:00 UTC: a new UTC day, although the Singapore day has not changed.
    expect((await admit(shop, midnight, { limits })).ok).toBe(true);
  });

  it("an expired open import does not block the next admission", async () => {
    const shop = await newImportShop(fixture.database, "expired-open");
    const now = nextDay();
    await pastAttempt(shop, later(now, -120_000), { outcome: null });
    const admitted = await admit(shop, now, { limits: { ...ISOLATED, outletInFlight: 1, globalInFlight: 1 } });
    expect(admitted).toMatchObject({ ok: true });
  });

  it("imports fail closed until a spend ceiling is recorded", async () => {
    const shop = await newImportShop(fixture.database, "no-ceiling");
    expect(await admit(shop, nextDay(), { policy: fixturePolicy(null) })).toEqual({ ok: false, reason: "spend_ceiling_unset" });
    expect(await openRows([shop.outletId])).toBe(0);
  });

  it("unreviewed menu model is refused", async () => {
    const shop = await newImportShop(fixture.database, "unreviewed");
    expect(await admit(shop, nextDay(), { model: "FIXTURE-unreviewed-model" })).toEqual({ ok: false, reason: "model_bounds_missing" });
  });

  it("reservation beyond the daily ceiling is refused", async () => {
    const shop = await newImportShop(fixture.database, "ceiling");
    const now = nextDay();
    // One live attempt holds its reservation; a second one would make two, one micro over the ceiling.
    expect((await admit(shop, now)).ok).toBe(true);
    expect(await admit(shop, later(now, 1_000), { policy: fixturePolicy(2 * FIXTURE_RESERVATION - 1) })).toEqual({ ok: false, reason: "spend_ceiling_reached" });
  });

  it("usage above its reservation stops further imports", async () => {
    const shop = await newImportShop(fixture.database, "overrun");
    const now = nextDay();
    // Its own bounds entry, so the overrun stops only this configuration and no other case.
    const bounds = { ...FIXTURE_BOUNDS, maxOutputTokens: FIXTURE_BOUNDS.maxOutputTokens + 1 };
    await pastAttempt(shop, later(now, -3_600_000), { dispatched: true, actual: FIXTURE_RESERVATION + 1_001, config: modelConfigVersion(bounds) });
    expect(await admit(shop, now, { policy: fixturePolicy(1_000_000, [bounds]) })).toEqual({ ok: false, reason: "model_bounds_exceeded" });
  });

  it("an attempt closed before the model call releases its reservation", async () => {
    const shop = await newImportShop(fixture.database, "released");
    const now = nextDay();
    await pastAttempt(shop, later(now, -60_000), { outcome: "rejected_photo", dispatched: false });
    const admitted = await admit(shop, now, { policy: fixturePolicy(2 * FIXTURE_RESERVATION - 1) });
    expect(admitted).toMatchObject({ ok: true, reservedUsdMicros: FIXTURE_RESERVATION });
  });
});

describe("concurrent admissions admit one", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("admission-race", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 10));
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  it("concurrent admissions admit one", async () => {
    const shops: ImportShop[] = [];
    for (let n = 0; n < 8; n += 1) shops.push(await newImportShop(fixture.database, `race-${n}`));
    const now = new Date(Date.UTC(2027, 5, 1, 12));
    const results = await Promise.all(
      shops.map((shop) =>
        admitMenuImport(db, {
          outletId: shop.outletId,
          actorUserId: shop.merchant.userId,
          consentVersion: "FIXTURE-consent",
          baseRevisionId: shop.revisionId,
          model: FIXTURE_VISION_MODEL,
          limits: { outletInFlight: 1, globalInFlight: 1, outletDaily: 10, globalDaily: 50 },
          policy: fixturePolicy(),
          now,
        }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const [{ n }] = await fixture.database.admin<[{ n: number }]>`select count(*)::int as n from menu_imports where closed_at is null`;
    expect(n).toBe(1);
  });
});

describe("aborted attempt keeps its spend reservation", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("admission-abort", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 5));
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  it("aborted attempt keeps its spend reservation", async () => {
    const shop = await newImportShop(fixture.database, "aborted");
    const now = new Date(Date.UTC(2027, 6, 1, 12));
    const policy = fixturePolicy(2 * FIXTURE_RESERVATION - 1);
    const first = await admitMenuImport(db, {
      outletId: shop.outletId,
      actorUserId: shop.merchant.userId,
      consentVersion: "FIXTURE-consent",
      baseRevisionId: shop.revisionId,
      model: FIXTURE_VISION_MODEL,
      limits: ISOLATED,
      policy,
      now,
    });
    if (!first.ok) throw new Error("FIXTURE first admission was refused");
    expect(await markModelDispatched(db, first.importId, later(now, 1_000))).toEqual({ marked: true });
    expect(await closeImportFailed(db, first.importId, "aborted", null, later(now, 2_000))).toEqual({ closed: true });

    const second = await admitMenuImport(db, {
      outletId: shop.outletId,
      actorUserId: shop.merchant.userId,
      consentVersion: "FIXTURE-consent",
      baseRevisionId: shop.revisionId,
      model: FIXTURE_VISION_MODEL,
      limits: ISOLATED,
      policy,
      now: later(now, 3_000),
    });
    expect(second).toEqual({ ok: false, reason: "spend_ceiling_reached" });
  });

  const later = (from: Date, ms: number) => new Date(from.getTime() + ms);
});

describe("import tables have no image column", () => {
  let fixture: PaymentsFixture;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("import-columns", FIXTURE_VISION_ENV);
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  it("import tables have no image column", async () => {
    const columns = await fixture.database.admin<{ table_name: string; column_name: string; data_type: string }[]>`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name in ('menu_imports', 'menu_import_admission', 'audit_events') order by table_name, ordinal_position`;
    // The introspection reads all three tables, so an empty answer cannot pass.
    expect(new Set(columns.map((column) => column.table_name))).toEqual(new Set(["menu_imports", "menu_import_admission", "audit_events"]));
    expect(columns.filter((column) => column.data_type === "bytea")).toEqual([]);
    // Name parts that would describe image content, a reference to it or a digest of it.
    const imageLike = /^(image|img|photo|picture|jpeg|jpg|hash|sha\d*|digest|url|uri|data|base64|blob|file|filename|content)$/i;
    expect(columns.filter((column) => column.column_name.split("_").some((part) => imageLike.test(part)))).toEqual([]);
  });
});
