-- S45 (Gate 2 fourth build plan amendment, 2026-11-07; refund step 5 revised 2026-11-08): one full
-- refund per PayPal attempt, sent only from a member's confirmation on the demo seller's credentials,
-- and the merchant_copilot limiter bucket. No table stores a copilot message.
-- Edited after generation: the web-role grants below are added. The web role may read and insert
-- refunds and update only their state, PayPal's refund id, the refusal reason and updated_at; it can
-- never delete one or change its amount, attempt or idempotency key. The purchase stays Paid.
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"purchase_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"capture_id" text NOT NULL,
	"paypal_refund_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"state" text NOT NULL,
	"outcome_reason" text,
	"confirmed_by_user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_paypal_refund_id_unique" UNIQUE("paypal_refund_id"),
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_state_check" CHECK ("refunds"."state" in ('sent', 'completed', 'failed', 'checking')),
	CONSTRAINT "refunds_currency_check" CHECK ("refunds"."currency" in ('SGD', 'USD')),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount_minor" > 0),
	CONSTRAINT "refunds_completed_check" CHECK ("refunds"."state" <> 'completed' or "refunds"."paypal_refund_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_one_per_attempt" ON "refunds" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "refunds_purchase_idx" ON "refunds" USING btree ("purchase_id");--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot'));--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."refunds" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("state", "paypal_refund_id", "outcome_reason", "updated_at") ON TABLE public."refunds" TO envoi_web;
