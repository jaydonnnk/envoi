-- S27 rollback of migration 0027, run by hand only with the deploy rolled back to the commit before
-- S27 (docs/plans/envoi/s27-deploy-plan.md). Not a drizzle migration: no journal entry names it.
-- It restores the 0026 schema exactly, every amount kept, and removes 0027's journal row so the
-- migration can be applied again later. It refuses while any USD row or US shop exists, because the
-- old code would show a US dollar amount as Singapore dollars; past that point the only way is
-- forward. One statement, so it applies whole or not at all.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "purchases" WHERE "currency" <> 'SGD')
     OR EXISTS (SELECT 1 FROM "payment_attempts" WHERE "currency" <> 'SGD')
     OR EXISTS (SELECT 1 FROM "outlets" WHERE "country" <> 'SG') THEN
    RAISE EXCEPTION 'a US shop or a USD amount exists: 0027 cannot be rolled back; fix forward';
  END IF;
  -- 1793329393401 is 0027's "when" in drizzle/meta/_journal.json, which drizzle stores as created_at.
  IF EXISTS (SELECT 1 FROM public."__drizzle_migrations" WHERE "created_at" > 1793329393401) THEN
    RAISE EXCEPTION 'a migration after 0027 is applied: roll that back first';
  END IF;
  DELETE FROM public."__drizzle_migrations" WHERE "created_at" = 1793329393401;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0027 is not recorded as applied';
  END IF;

  REVOKE UPDATE ("country") ON TABLE public."outlets" FROM envoi_web;
  DROP TRIGGER outlets_country_locked ON "outlets";
  DROP FUNCTION envoi_outlet_country_locked();

  UPDATE "purchases" SET "lines" = (
    SELECT jsonb_agg((l.value - 'unitMinor' - 'lineMinor') || jsonb_build_object('unitSgdCents', l.value->'unitMinor', 'lineSgdCents', l.value->'lineMinor') ORDER BY l.position)
    FROM jsonb_array_elements("purchases"."lines") WITH ORDINALITY AS l(value, position)
  )
  WHERE jsonb_path_exists("purchases"."lines", '$[*].unitMinor');

  ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_currency_check";
  ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_currency_check" CHECK ("payment_attempts"."currency" = 'SGD');
  ALTER TABLE "purchases" DROP CONSTRAINT "purchases_currency_check";
  ALTER TABLE "purchases" ADD CONSTRAINT "purchases_currency_check" CHECK ("purchases"."currency" = 'SGD');
  ALTER TABLE "purchases" ALTER COLUMN "currency" DROP DEFAULT;
  ALTER TABLE "payment_attempts" RENAME COLUMN "capture_gross_minor" TO "capture_gross_sgd_cents";
  ALTER TABLE "payment_attempts" RENAME COLUMN "total_minor" TO "total_sgd_cents";
  ALTER TABLE "purchases" RENAME COLUMN "total_minor" TO "total_sgd_cents";
  ALTER TABLE "menu_items" RENAME COLUMN "unit_minor" TO "unit_sgd_cents";
  ALTER TABLE "outlets" DROP CONSTRAINT "outlets_country_check";
  ALTER TABLE "outlets" DROP COLUMN "country";
END $$;
