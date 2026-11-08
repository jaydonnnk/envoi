-- Rollback of migration 0033, run by hand only with the deploy rolled back to the commit before it.
-- Not a drizzle migration: remove 0033's journal row by hand too if it must be applied again.
-- Drops the stored fees, nets and payer countries; PayPal still holds them on each capture.
-- Refuses while a merchant_digest limiter row exists.
ALTER TABLE "payment_attempts" DROP COLUMN "capture_fee_minor";
ALTER TABLE "payment_attempts" DROP COLUMN "capture_net_minor";
ALTER TABLE "payment_attempts" DROP COLUMN "payer_country";
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot'));
