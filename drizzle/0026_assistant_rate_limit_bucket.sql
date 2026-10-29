-- S25: Ask Envoi in the site (Gate 3 reopening 2026-10-29, S25 limiter bucket). The assistant route
-- admits each turn under its own limiter key, buyer_assistant, which the bucket check must allow. No
-- table, column, index or grant changes: the web role already inserts into rate_limit_hits.
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant'));
