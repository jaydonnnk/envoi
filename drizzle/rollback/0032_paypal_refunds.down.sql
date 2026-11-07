-- Rollback of migration 0032, run by hand only with the deploy rolled back to the commit before it.
-- Not a drizzle migration: remove 0032's journal row by hand too if it must be applied again.
-- Drops every stored refund row: read the refunds first and keep PayPal's refund ids, since the
-- refunds themselves stay in PayPal. Refuses while a merchant_copilot limiter row exists.
DROP TABLE "refunds";
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp'));
