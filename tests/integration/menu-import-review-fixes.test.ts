import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitMenuImport } from "@/domain/imports/admission";
import { closeImportFailed, commitImport, markModelDispatched } from "@/domain/imports/lifecycle";
import type { ImportUsage } from "@/domain/imports/types";
import { validateVisionDraft, type VisionDraftValidation } from "@/domain/imports/validate-result";
import { saveMenuDraft } from "@/domain/menu/draft";
import { connectWeb, type Db } from "@/lib/db/web";
import { isAppError } from "@/lib/errors";
import { FIXTURE_VISION_ENV, FIXTURE_VISION_MODEL, fixturePolicy, newImportShop, visionItem } from "../support/menu-import";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { loadMerchantRoutes, shopApi, type MerchantRoutes } from "../support/publication";

// S11 review fixes: three guards of the import lifecycle that every S11 test passed without, each
// run as envoi_web against a migrated disposable database on FIXTURE model output. Each case uses
// its own FIXTURE shop.

const ISOLATED = { outletInFlight: 100, globalInFlight: 100, outletDaily: 1_000, globalDaily: 1_000 };
const USAGE: ImportUsage = { inputTokens: 1_200, outputTokens: 300, actualUsdMicros: 1_500, latencyMs: 4_000, peakRssBytes: 150_000_000 };

function validated(items: unknown[]): Extract<VisionDraftValidation, { ok: true }> {
  const result = validateVisionDraft({ items });
  if (!result.ok) throw new Error(`FIXTURE output was refused: ${result.reason}`);
  return result;
}

describe("menu import lifecycle, review fixes", () => {
  let fixture: PaymentsFixture;
  let db: Db;
  let close: () => Promise<void>;
  let routes: MerchantRoutes;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("import-review", FIXTURE_VISION_ENV);
    ({ db, close } = connectWeb(fixture.database.webUrl, 5));
    routes = await loadMerchantRoutes();
  });

  afterAll(async () => {
    await close?.();
    await fixture?.database.drop();
  });

  async function admit(outletId: string, actorUserId: string, baseRevisionId: string, now: Date): Promise<{ importId: string; deadlineAt: Date }> {
    const admission = await admitMenuImport(db, { outletId, actorUserId, consentVersion: "FIXTURE-consent", baseRevisionId, model: FIXTURE_VISION_MODEL, limits: ISOLATED, policy: fixturePolicy(), now });
    if (!admission.ok) throw new Error(`FIXTURE admission was refused: ${admission.reason}`);
    return admission;
  }

  const row = async (importId: string) =>
    (
      await fixture.database.admin<{ closed_outcome: string | null; model_dispatched_at: Date | null; actual_usd_micros: string | null }[]>`
        select closed_outcome, model_dispatched_at, actual_usd_micros from menu_imports where id = ${importId}`
    )[0]!;

  it("the dispatch mark and a failure close write only while the attempt is open and before its deadline", async () => {
    const shop = await newImportShop(fixture.database, "lifecycle-bounds");
    const now = new Date();

    // A closed attempt never gets a dispatch mark, so no model call can follow it.
    const closed = await admit(shop.outletId, shop.merchant.userId, shop.revisionId, now);
    expect(await closeImportFailed(db, closed.importId, "rejected_photo", null, now)).toEqual({ closed: true });
    expect(await markModelDispatched(db, closed.importId, now)).toEqual({ marked: false });
    expect(await row(closed.importId)).toMatchObject({ closed_outcome: "rejected_photo", model_dispatched_at: null });

    // An attempt at its deadline is expired: no dispatch mark.
    const late = await admit(shop.outletId, shop.merchant.userId, shop.revisionId, now);
    expect(await markModelDispatched(db, late.importId, late.deadlineAt)).toEqual({ marked: false });
    expect((await row(late.importId)).model_dispatched_at).toBeNull();

    // Nor a failure close: it stays open and reads as expired, and only its usage is recorded.
    expect(await closeImportFailed(db, late.importId, "model_failed", USAGE, late.deadlineAt)).toEqual({ closed: false });
    expect(await row(late.importId)).toMatchObject({ closed_outcome: null, actual_usd_micros: "1500" });
  });

  it("an import on a published menu adds to a new draft and keeps the published items' keys", async () => {
    const api = shopApi(fixture.database, routes);
    const { shop } = await api.publishedShop("published-import");
    const published = await api.getDraft(shop);
    expect(published).toMatchObject({ published: true, status: "confirmed" });
    const keys = async (revisionId: string) =>
      fixture.database.admin<{ name: string; itemKey: string }[]>`select name, item_key as "itemKey" from menu_items where menu_revision_id = ${revisionId} order by position`;
    const publishedKeys = await keys(published.revisionId);

    const { importId } = await admit(shop.outletId, shop.merchant.userId, published.revisionId, new Date());
    const result = await commitImport(db, importId, validated([visionItem("FIXTURE Teh C", "1.70")]), USAGE, new Date());
    expect(result.committed).toBe(true);
    if (!result.committed) return;

    // A new unpublished draft holds the published items under their item keys, then the suggestion.
    expect(result.draft.revisionId).not.toBe(published.revisionId);
    expect(result.draft.items.map((item) => [item.name, item.source])).toEqual([...publishedKeys.map((item) => [item.name, "merchant"]), ["FIXTURE Teh C", "import_suggestion"]]);
    expect((await keys(result.draft.revisionId)).slice(0, publishedKeys.length)).toEqual(publishedKeys);
    // Buyers keep reading the published revision, unchanged.
    expect(await keys(published.revisionId)).toEqual(publishedKeys);
    const [outlet] = await fixture.database.admin<{ published: string }[]>`select published_menu_revision_id as published from outlets where id = ${shop.outletId}`;
    expect(outlet!.published).toBe(published.revisionId);
  });

  it("an import never grows a menu past 100 items", async () => {
    const shop = await newImportShop(fixture.database, "capacity");
    const items = Array.from({ length: 99 }, (_, n) => ({ name: `FIXTURE item ${n}`, portion: null, priceMinor: 100 + n, availability: "available" as const }));
    const saved = await saveMenuDraft(db, { outletId: shop.outletId, revisionId: shop.revisionId, baseVersion: 1, items, actorUserId: shop.merchant.userId, now: new Date() });
    if (isAppError(saved)) throw new Error(`FIXTURE draft was not saved: ${saved.code}`);

    const { importId } = await admit(shop.outletId, shop.merchant.userId, shop.revisionId, new Date());
    const suggestions = validated([visionItem("FIXTURE Teh", "1.60"), visionItem("FIXTURE Milo", "2.00"), visionItem("FIXTURE Horlicks", "2.20")]);
    const result = await commitImport(db, importId, suggestions, USAGE, new Date());
    expect(result.committed).toBe(true);
    if (!result.committed) return;
    expect(result.merge.addedItemIds).toHaveLength(1);
    expect(result.merge.skippedForCapacity).toBe(2);
    expect(result.draft.items).toHaveLength(100);
    expect(result.draft.items.at(-1)).toMatchObject({ name: "FIXTURE Teh", source: "import_suggestion" });
  });
});
