-- S27: US shops and currency-explicit money (Gate 3 reopening 2026-10-29, second build plan). Every
-- amount keeps its value; only names change, and the currency sits beside it. Existing outlets are
-- Singapore shops and existing purchases are SGD, which the defaults record.
ALTER TABLE "outlets" ADD COLUMN "country" text DEFAULT 'SG' NOT NULL;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_country_check" CHECK ("outlets"."country" in ('SG', 'US'));--> statement-breakpoint
ALTER TABLE "menu_items" RENAME COLUMN "unit_sgd_cents" TO "unit_minor";--> statement-breakpoint
ALTER TABLE "purchases" RENAME COLUMN "total_sgd_cents" TO "total_minor";--> statement-breakpoint
ALTER TABLE "payment_attempts" RENAME COLUMN "total_sgd_cents" TO "total_minor";--> statement-breakpoint
ALTER TABLE "payment_attempts" RENAME COLUMN "capture_gross_sgd_cents" TO "capture_gross_minor";--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "currency" SET DEFAULT 'SGD';--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_currency_check";--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_currency_check" CHECK ("purchases"."currency" in ('SGD', 'USD'));--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_currency_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_currency_check" CHECK ("payment_attempts"."currency" in ('SGD', 'USD'));--> statement-breakpoint

-- The stored basket lines carry the same rename, in their original order, with every value kept.
UPDATE "purchases" SET "lines" = (
  SELECT jsonb_agg((l.value - 'unitSgdCents' - 'lineSgdCents') || jsonb_build_object('unitMinor', l.value->'unitSgdCents', 'lineMinor', l.value->'lineSgdCents') ORDER BY l.position)
  FROM jsonb_array_elements("purchases"."lines") WITH ORDINALITY AS l(value, position)
)
WHERE jsonb_path_exists("purchases"."lines", '$[*].unitSgdCents');
--> statement-breakpoint

-- A shop's country is fixed once any revision of it has been published: published prices are in
-- its currency. The domain refuses first with country_locked; this is the database's own guard.
CREATE FUNCTION envoi_outlet_country_locked() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.country IS DISTINCT FROM OLD.country
     AND EXISTS (SELECT 1 FROM "menu_revisions" WHERE "outlet_id" = OLD.id AND "published_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'outlet % has published, so its country cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER outlets_country_locked BEFORE UPDATE OF "country" ON "outlets" FOR EACH ROW EXECUTE FUNCTION envoi_outlet_country_locked();
--> statement-breakpoint
-- The merchant chooses the country before first publication, through the web role.
GRANT UPDATE ("country") ON TABLE public."outlets" TO envoi_web;
