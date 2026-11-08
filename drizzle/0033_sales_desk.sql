-- S46 (Gate 2 fourth build plan amendment, 2026-11-07, Data 2): what PayPal charged and what
-- reached the shop, and the payer's country, read beside capture verification and never deciding
-- it; and the merchant_digest limiter bucket, used by S47. Null means unknown, never zero, and
-- older orders stay null.
-- Edited after generation: the grants below are added. Both roles that write verified capture
-- evidence (envoi_web and envoi_maintenance) may set the three new columns.
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "capture_fee_minor" integer;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "capture_net_minor" integer;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "payer_country" text;--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot', 'merchant_digest'));--> statement-breakpoint
GRANT UPDATE ("capture_fee_minor", "capture_net_minor", "payer_country") ON TABLE public."payment_attempts" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("capture_fee_minor", "capture_net_minor", "payer_country") ON TABLE public."payment_attempts" TO envoi_maintenance;
