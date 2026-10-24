-- S18: the merchant's archive of an order (Gate 3 reopening 2026-10-24). Deleting an order on
-- /merchant/orders only hides it: the purchase, its attempts and its receipt never change. The state
-- at archive time is kept so an order archived before it was paid can be listed again once paid.
-- Edited after generation: the web-role grant and the trigger below are added (Gate 4 delta D7). The
-- web role and the maintenance role may set the three columns once and never clear or change them;
-- only the operator's migration role, through unarchive-order, can.
ALTER TABLE "purchases" ADD COLUMN "merchant_archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "merchant_archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "merchant_archived_state" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_merchant_archived_by_user_id_user_id_fk" FOREIGN KEY ("merchant_archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_merchant_archived_check" CHECK ((("purchases"."merchant_archived_at" is null) = ("purchases"."merchant_archived_by_user_id" is null)) and (("purchases"."merchant_archived_at" is null) = ("purchases"."merchant_archived_state" is null)));--> statement-breakpoint
CREATE FUNCTION envoi_merchant_archive_once() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.merchant_archived_at IS NOT NULL
     AND (NEW.merchant_archived_at IS DISTINCT FROM OLD.merchant_archived_at
          OR NEW.merchant_archived_by_user_id IS DISTINCT FROM OLD.merchant_archived_by_user_id
          OR NEW.merchant_archived_state IS DISTINCT FROM OLD.merchant_archived_state)
     AND current_user IN ('envoi_web', 'envoi_maintenance') THEN
    RAISE EXCEPTION 'purchase % is already archived', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchases_merchant_archive_once BEFORE UPDATE ON "purchases" FOR EACH ROW EXECUTE FUNCTION envoi_merchant_archive_once();
--> statement-breakpoint
GRANT UPDATE ("merchant_archived_at", "merchant_archived_by_user_id", "merchant_archived_state") ON TABLE public."purchases" TO envoi_web;
