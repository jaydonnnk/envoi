-- Edited after generation: the seed rows and web-role grants at the end are added (Gate 4 delta D7:
-- S16 gives the web role wallet_challenges, pyusd_rates, the RPC limiter rows and the PYUSD attempt
-- columns). The web role inserts a PYUSD destination naming only its own columns, so it can never
-- write a PayPal seller id; it appends rates and challenges, consumes a challenge once, and updates
-- only an attempt's hints, bound signature and verification time beside the columns it already had.
-- Widened CHECK constraints are dropped and re-added in the same migration; every existing row
-- satisfies the new ones, and no data changes.
CREATE TABLE "pyusd_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"atomic_per_sgd" bigint NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	CONSTRAINT "pyusd_rates_bounds_check" CHECK ("pyusd_rates"."atomic_per_sgd" between 1 and 10000000)
);
--> statement-breakpoint
CREATE TABLE "rpc_limiter_backoff" (
	"id" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone,
	"consecutive" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rpc_limiter_backoff_singleton_check" CHECK ("rpc_limiter_backoff"."id" = 'global')
);
--> statement-breakpoint
CREATE TABLE "rpc_limiter_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpc_limiter_slots" (
	"slot" integer PRIMARY KEY NOT NULL,
	"holder" text,
	"lease_expires_at" timestamp with time zone,
	CONSTRAINT "rpc_limiter_slots_range_check" CHECK ("rpc_limiter_slots"."slot" in (0, 1)),
	CONSTRAINT "rpc_limiter_slots_lease_check" CHECK (("rpc_limiter_slots"."holder" is null) = ("rpc_limiter_slots"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "wallet_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"member_user_id" text NOT NULL,
	"wallet" text NOT NULL,
	"message" "bytea" NOT NULL,
	"nonce_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "wallet_challenges_nonce_hash_unique" UNIQUE("nonce_hash"),
	CONSTRAINT "wallet_challenges_expiry_check" CHECK ("wallet_challenges"."expires_at" > "wallet_challenges"."issued_at")
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_state_check";--> statement-breakpoint
ALTER TABLE "payment_destinations" DROP CONSTRAINT "payment_destinations_rail_check";--> statement-breakpoint
ALTER TABLE "payment_destinations" DROP CONSTRAINT "payment_destinations_environment_check";--> statement-breakpoint
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" ALTER COLUMN "payee_merchant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ALTER COLUMN "create_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_destinations" ALTER COLUMN "seller_merchant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "rail" text DEFAULT 'paypal' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_buyer_wallet" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_source_token_account" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_destination_token_account" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_atomic_amount" bigint;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_rate_version_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_reference" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_message_fingerprint" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_blockhash" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_last_valid_block_height" bigint;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_preparation_slot" bigint;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_fee" jsonb;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_hints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_finalized_signature" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "token_account" text;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "key_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "key_verified_by_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "pyusd_rate_version_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "pyusd_atomic_amount" bigint;--> statement-breakpoint
ALTER TABLE "pyusd_rates" ADD CONSTRAINT "pyusd_rates_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pyusd_rates" ADD CONSTRAINT "pyusd_rates_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_challenges" ADD CONSTRAINT "wallet_challenges_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_challenges" ADD CONSTRAINT "wallet_challenges_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pyusd_rates_outlet_confirmed_idx" ON "pyusd_rates" USING btree ("outlet_id","confirmed_at");--> statement-breakpoint
CREATE INDEX "rpc_limiter_calls_at_idx" ON "rpc_limiter_calls" USING btree ("at");--> statement-breakpoint
CREATE INDEX "rpc_limiter_calls_method_at_idx" ON "rpc_limiter_calls" USING btree ("method","at");--> statement-breakpoint
CREATE INDEX "wallet_challenges_outlet_idx" ON "wallet_challenges" USING btree ("outlet_id","issued_at");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_rate_version_id_pyusd_rates_id_fk" FOREIGN KEY ("pyusd_rate_version_id") REFERENCES "public"."pyusd_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_key_verified_by_user_id_user_id_fk" FOREIGN KEY ("key_verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_pyusd_rate_version_id_pyusd_rates_id_fk" FOREIGN KEY ("pyusd_rate_version_id") REFERENCES "public"."pyusd_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_pyusd" ON "payment_attempts" USING btree ("purchase_id") WHERE "payment_attempts"."rail" = 'pyusd';--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_reference_unique" UNIQUE("pyusd_reference");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_finalized_signature_unique" UNIQUE("pyusd_finalized_signature");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_rail_check" CHECK ("payment_attempts"."rail" in ('paypal', 'pyusd'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paypal_fields_check" CHECK ("payment_attempts"."rail" <> 'paypal' or ("payment_attempts"."payee_merchant_id" is not null and "payment_attempts"."create_request_id" is not null));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_fields_check" CHECK ("payment_attempts"."rail" <> 'pyusd' or ("payment_attempts"."payee_merchant_id" is null and "payment_attempts"."create_request_id" is null and "payment_attempts"."pyusd_buyer_wallet" is not null and "payment_attempts"."pyusd_source_token_account" is not null and "payment_attempts"."pyusd_destination_token_account" is not null and "payment_attempts"."pyusd_atomic_amount" > 0 and "payment_attempts"."pyusd_rate_version_id" is not null and "payment_attempts"."pyusd_reference" is not null and "payment_attempts"."pyusd_message_fingerprint" is not null and "payment_attempts"."pyusd_blockhash" is not null and "payment_attempts"."pyusd_last_valid_block_height" is not null and "payment_attempts"."pyusd_preparation_slot" is not null and "payment_attempts"."pyusd_fee" is not null));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_confirmed_check" CHECK ("payment_attempts"."state" <> 'confirmed' or ("payment_attempts"."pyusd_finalized_signature" is not null and "payment_attempts"."pyusd_verified_at" is not null));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_hints_check" CHECK (jsonb_typeof("payment_attempts"."pyusd_hints") = 'array' and jsonb_array_length("payment_attempts"."pyusd_hints") <= 3);--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_state_check" CHECK (("payment_attempts"."rail" = 'paypal' and "payment_attempts"."state" in ('created', 'order_created', 'externally_approved', 'capture_dispatched', 'capture_confirmed', 'capture_failed', 'create_unknown', 'capture_unknown', 'abandoned')) or ("payment_attempts"."rail" = 'pyusd' and "payment_attempts"."state" in ('prepared', 'confirmed', 'mismatch', 'expired_scanning', 'held_no_match', 'closed_unpaid')));--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_rail_fields_check" CHECK (("payment_destinations"."rail" = 'paypal' and "payment_destinations"."environment" = 'sandbox' and "payment_destinations"."seller_merchant_id" is not null and "payment_destinations"."wallet_address" is null and "payment_destinations"."token_account" is null and "payment_destinations"."key_verified_at" is null) or ("payment_destinations"."rail" = 'pyusd' and "payment_destinations"."environment" = 'devnet' and "payment_destinations"."seller_merchant_id" is null and "payment_destinations"."wallet_address" is not null and "payment_destinations"."token_account" is not null and "payment_destinations"."key_verified_at" is not null and "payment_destinations"."key_verified_by_user_id" is not null and "payment_destinations"."accepted_at" is null));--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_rail_check" CHECK ("payment_destinations"."rail" in ('paypal', 'pyusd'));--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_environment_check" CHECK ("payment_destinations"."environment" in ('sandbox', 'devnet'));--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_pyusd_price_check" CHECK (("purchases"."rail" = 'pyusd' and "purchases"."pyusd_rate_version_id" is not null and "purchases"."pyusd_atomic_amount" > 0) or ("purchases"."rail" is distinct from 'pyusd' and "purchases"."pyusd_rate_version_id" is null and "purchases"."pyusd_atomic_amount" is null));--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge'));--> statement-breakpoint
INSERT INTO "rpc_limiter_slots" ("slot") VALUES (0), (1);--> statement-breakpoint
INSERT INTO "rpc_limiter_backoff" ("id") VALUES ('global');--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."pyusd_rates" TO envoi_web;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."wallet_challenges" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("consumed_at") ON TABLE public."wallet_challenges" TO envoi_web;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE public."rpc_limiter_calls" TO envoi_web;--> statement-breakpoint
GRANT SELECT ON TABLE public."rpc_limiter_slots", public."rpc_limiter_backoff" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("holder", "lease_expires_at") ON TABLE public."rpc_limiter_slots" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("until", "consecutive") ON TABLE public."rpc_limiter_backoff" TO envoi_web;--> statement-breakpoint
GRANT INSERT ("id", "outlet_id", "rail", "environment", "status", "version", "wallet_address", "token_account", "key_verified_at", "key_verified_by_user_id", "created_at") ON TABLE public."payment_destinations" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("wallet_address", "token_account", "key_verified_at", "key_verified_by_user_id") ON TABLE public."payment_destinations" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("pyusd_hints", "pyusd_finalized_signature", "pyusd_verified_at") ON TABLE public."payment_attempts" TO envoi_web;
