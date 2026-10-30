import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitMenuImport } from "@/domain/imports/admission";
import { commitImport, deriveImportOutcome, latestImport } from "@/domain/imports/lifecycle";
import { commitRefusal } from "@/domain/imports/request";
import type { ImportUsage } from "@/domain/imports/types";
import { validateVisionDraft, type VisionDraftValidation } from "@/domain/imports/validate-result";
import { saveMenuDraft } from "@/domain/menu/draft";
import { connectWeb, type Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { isAppError } from "@/lib/errors";
import { FIXTURE_VISION_ENV, FIXTURE_VISION_MODEL, fixturePolicy, newImportShop, visionItem, type ImportShop } from "../support/menu-import";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";

// S11: commitImport as envoi_web against a migrated disposable database, on FIXTURE model output.
// Each case uses its own shop, so no case sees another's draft.

const ISOLATED = { outletInFlight: 100, globalInFlight: 100, outletDaily: 1_000, globalDaily: 1_000 };
const USAGE: ImportUsage = { inputTokens: 1_200, outputTokens: 300, actualUsdMicros: 1_500, latencyMs: 4_000, peakRssBytes: 150_000_000 };

function validated(items: unknown[]): Extract<VisionDraftValidation, { ok: true }> {
  const result = validateVisionDraft({ items });
  if (!result.ok) throw new Error(`FIXTURE output was refused: ${result.reason}`);
  return result;
}

describe("import commit merges nothing unless every recheck passes", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("import-commit", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 5));
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  async function admitted(shop: ImportShop, now: Date): Promise<string> {
    const admission = await admitMenuImport(db, {
      outletId: shop.outletId,
      actorUserId: shop.merchant.userId,
      consentVersion: "FIXTURE-consent",
      baseRevisionId: shop.revisionId,
      model: FIXTURE_VISION_MODEL,
      limits: ISOLATED,
      policy: fixturePolicy(),
      now,
    });
    if (!admission.ok) throw new Error(`FIXTURE admission was refused: ${admission.reason}`);
    return admission.importId;
  }

  const draftState = (outletId: string) => fixture.database.admin`
    select r.id, r.version, r.status, (select count(*)::int from menu_items i where i.menu_revision_id = r.id) as items
    from menu_revisions r where r.outlet_id = ${outletId} order by r.created_at, r.id`;
  const attempt = async (importId: string) =>
    (await fixture.database.admin<{ closed_outcome: string | null }[]>`select closed_outcome from menu_imports where id = ${importId}`)[0]!;

  const DRAFT = validated([visionItem("Kopi O", "1.80"), visionItem("Kaya toast", null)]);

  it("late result is rejected", async () => {
    const shop = await newImportShop(fixture.database, "late");
    const now = new Date();
    const importId = await admitted(shop, now);
    const before = await draftState(shop.outletId);
    const late = new Date(now.getTime() + 90_000);
    const result = await commitImport(db, importId, DRAFT, USAGE, late);
    expect(result).toEqual({ committed: false, outcome: "expired" });
    if (result.committed) return;
    expect(commitRefusal(importId, result.outcome).code).toBe("import_expired");
    expect(await draftState(shop.outletId)).toEqual(before);
    const latest = await latestImport(db, shop.outletId, late);
    expect(latest && deriveImportOutcome(latest, late)).toBe("expired");
  });

  it("base revision change is rejected", async () => {
    const shop = await newImportShop(fixture.database, "superseded");
    const importId = await admitted(shop, new Date());
    // FIXTURE: a newer draft revision supersedes the one the import was based on.
    await fixture.database.admin`insert into menu_revisions (id, outlet_id, status, version, created_at)
      values (${newId("mrv")}, ${shop.outletId}, 'draft', 1, now() + interval '1 second')`;
    const before = await draftState(shop.outletId);
    const result = await commitImport(db, importId, DRAFT, USAGE, new Date());
    expect(result).toEqual({ committed: false, outcome: "conflict_base_revision" });
    if (result.committed) return;
    expect(commitRefusal(importId, result.outcome).code).toBe("import_base_revision_changed");
    expect(await attempt(importId)).toEqual({ closed_outcome: "conflict_base_revision" });
    expect(await draftState(shop.outletId)).toEqual(before);
  });

  it("confirmed menu is never overwritten", async () => {
    const shop = await newImportShop(fixture.database, "confirmed");
    const saved = await saveMenuDraft(db, {
      outletId: shop.outletId,
      revisionId: shop.revisionId,
      baseVersion: 1,
      items: [{ name: "Teh", portion: null, priceMinor: 160, availability: "available" }],
      actorUserId: shop.merchant.userId,
      now: new Date(),
    });
    if (isAppError(saved)) throw new Error("FIXTURE draft was not saved");
    const importId = await admitted(shop, new Date());
    await fixture.database.admin`update menu_revisions set status = 'confirmed', confirmed_at = now() where id = ${shop.revisionId}`;
    const before = await draftState(shop.outletId);
    const result = await commitImport(db, importId, DRAFT, USAGE, new Date());
    expect(result).toEqual({ committed: false, outcome: "conflict_confirmed" });
    expect(await attempt(importId)).toEqual({ closed_outcome: "conflict_confirmed" });
    expect(await draftState(shop.outletId)).toEqual(before);
  });

  it("membership removed during an import merges nothing", async () => {
    const shop = await newImportShop(fixture.database, "revoked");
    const importId = await admitted(shop, new Date());
    await fixture.database.admin`update merchant_memberships set revoked_at = now() where user_id = ${shop.merchant.userId}`;
    const before = await draftState(shop.outletId);
    const result = await commitImport(db, importId, DRAFT, USAGE, new Date());
    expect(result).toEqual({ committed: false, outcome: "membership_revoked" });
    if (result.committed) return;
    expect(commitRefusal(importId, result.outcome).code).toBe("forbidden_membership");
    expect(await attempt(importId)).toEqual({ closed_outcome: "membership_revoked" });
    expect(await draftState(shop.outletId)).toEqual(before);
  });
});

describe("merchant edits survive a merge", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("import-merge", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 5));
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  it("merchant edits survive a merge", async () => {
    const shop = await newImportShop(fixture.database, "edits");
    // The merchant corrected the price the menu prints for Kopi O, and named an item themselves.
    const saved = await saveMenuDraft(db, {
      outletId: shop.outletId,
      revisionId: shop.revisionId,
      baseVersion: 1,
      items: [
        { name: "Kopi O", portion: null, priceMinor: 180, availability: "available" },
        { name: "House kaya toast set", portion: "2 slices", priceMinor: 420, availability: "available" },
      ],
      actorUserId: shop.merchant.userId,
      now: new Date(),
    });
    if (isAppError(saved)) throw new Error("FIXTURE draft was not saved");
    const admission = await admitMenuImport(db, {
      outletId: shop.outletId,
      actorUserId: shop.merchant.userId,
      consentVersion: "FIXTURE-consent",
      baseRevisionId: shop.revisionId,
      model: FIXTURE_VISION_MODEL,
      limits: ISOLATED,
      policy: fixturePolicy(),
      now: new Date(),
    });
    if (!admission.ok) throw new Error("FIXTURE admission was refused");

    const result = await commitImport(db, admission.importId, validated([visionItem("kopi o", "1.50"), visionItem("Teh C", "1.70")]), USAGE, new Date());
    expect(result.committed).toBe(true);
    if (!result.committed) return;
    const byName = new Map(result.draft.items.map((item) => [item.name, item]));
    expect(byName.get("Kopi O")).toMatchObject({ priceMinor: 180, availability: "available", source: "merchant" });
    expect(byName.get("House kaya toast set")).toMatchObject({ portion: "2 slices", priceMinor: 420, source: "merchant" });
    expect(byName.get("Teh C")).toMatchObject({ priceMinor: 170, availability: "unknown", source: "import_suggestion" });
    expect(byName.has("kopi o")).toBe(false);
    expect(result.draft.items).toHaveLength(3);
    expect(result.merge.preservedMerchantEditIds).toEqual([saved.items[0]!.id]);
  });
});
