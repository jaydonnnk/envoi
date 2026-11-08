-- Rollback of migration 0034, run by hand only with the deploy rolled back to the commit before it.
-- Not a drizzle migration: remove 0034's journal row by hand too if it must be applied again.
-- Drops every stored scan count; the hashes cannot be rebuilt without the scans themselves.
-- Refuses while a sticker_scan limiter row exists.
DROP TABLE "sticker_scan_counts";
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot', 'merchant_digest'));
