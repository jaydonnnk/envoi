-- S43 (Gate 2 fourth build plan amendment, Data 4; Gate 3 S43 amendment, decisions 5 and 6): the
-- seller id a self-created shop's member submits for review, a marker on outlets a stranger created,
-- the merchant_signup limiter bucket and the one function that creates a self-signed-up shop.
-- Edited after generation: the grant, the id helper, the function and its grants below are added.
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "requested_seller_merchant_id" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "seller_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "self_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot', 'merchant_digest', 'sticker_scan', 'merchant_signup'));
--> statement-breakpoint
-- The member may record a seller request on the enrollment; status and approval stay the operator's.
GRANT UPDATE ("requested_seller_merchant_id", "seller_requested_at") ON TABLE public."enrollments" TO envoi_web;
--> statement-breakpoint
-- An id in the shape of src/lib/ids.ts newId: the prefix, then 26 base32 characters of one random
-- UUID's 16 bytes (122 random bits; a version 4 UUID fixes the other six).
CREATE FUNCTION envoi_self_signup_id(prefix text) RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $$
DECLARE
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz234567';
  value bigint := 0;
  bits int := 0;
  out text := '';
  i int;
BEGIN
  FOR i IN 0..15 LOOP
    value := ((value << 8) | get_byte(bytes, i)) & 4095;
    bits := bits + 8;
    WHILE bits >= 5 LOOP
      out := out || substr(alphabet, ((value >> (bits - 5)) & 31)::int + 1, 1);
      bits := bits - 5;
    END LOOP;
  END LOOP;
  IF bits > 0 THEN out := out || substr(alphabet, ((value << (5 - bits)) & 31)::int + 1, 1); END IF;
  RETURN prefix || '_' || out;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION envoi_self_signup_id(text) FROM PUBLIC;
--> statement-breakpoint
-- Creates a stranger's one pending shop: the outlet (labeled a demo fixture and marked self_signup),
-- a bound owner membership, a pending enrollment and an empty draft revision, in the caller's
-- transaction. The user row is locked first, so two concurrent calls for one account make one shop.
-- An anonymous or missing user, or a user with any membership row in any state, is refused, so an
-- operator-made merchant never gains a second shop here. SECURITY DEFINER lets the web role write the
-- membership and the marker, which it holds no grant for; the search path is fixed.
CREATE FUNCTION create_self_signup_outlet(p_user_id text, p_name text, p_area text, p_now timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account record;
  new_outlet text := envoi_self_signup_id('out');
BEGIN
  SELECT "id", "is_anonymous" INTO account FROM "user" WHERE "id" = p_user_id FOR UPDATE;
  IF NOT FOUND OR account.is_anonymous IS TRUE THEN
    RAISE EXCEPTION 'self_signup_refused: no permanent account' USING ERRCODE = 'check_violation';
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION create_self_signup_outlet(text, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION create_self_signup_outlet(text, text, text, timestamptz) TO envoi_web;
