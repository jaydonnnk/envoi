ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "merchant_email_verification_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot', 'merchant_digest', 'sticker_scan', 'merchant_signup', 'merchant_email_resend', 'merchant_email_delivery'));
--> statement-breakpoint
-- Replace the existing function in place, keeping its owner and EXECUTE grants.
CREATE OR REPLACE FUNCTION create_self_signup_outlet(p_user_id text, p_name text, p_area text, p_now timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account record;
  new_outlet text := envoi_self_signup_id('out');
BEGIN
  SELECT "id", "is_anonymous", "merchant_email_verification_required", "email_verified" INTO account FROM "user" WHERE "id" = p_user_id FOR UPDATE;
  IF NOT FOUND OR account.is_anonymous IS TRUE THEN
    RAISE EXCEPTION 'self_signup_refused: no permanent account' USING ERRCODE = 'check_violation';
  END IF;
  IF account.merchant_email_verification_required AND NOT account.email_verified THEN
    RAISE EXCEPTION 'self_signup_refused: email_unconfirmed' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "merchant_memberships" WHERE "user_id" = p_user_id) THEN
    RAISE EXCEPTION 'self_signup_refused: one shop per account' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO "outlets" ("id", "name", "area", "is_demo_fixture", "self_signup", "created_at") VALUES (new_outlet, p_name, p_area, true, true, p_now);
  INSERT INTO "merchant_memberships" ("id", "user_id", "outlet_id", "role", "is_demo", "evidence_ref", "approved_at", "created_at")
    VALUES (envoi_self_signup_id('mbr'), p_user_id, new_outlet, 'owner', true, 'self_signup', p_now, p_now);
  INSERT INTO "enrollments" ("id", "outlet_id", "is_demo", "created_at") VALUES (envoi_self_signup_id('enr'), new_outlet, true, p_now);
  INSERT INTO "menu_revisions" ("id", "outlet_id", "status", "version", "created_at") VALUES (envoi_self_signup_id('mrv'), new_outlet, 'draft', 1, p_now);
  RETURN new_outlet;
END $$;
