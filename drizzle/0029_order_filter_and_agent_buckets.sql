-- Third build plan (Gate 2 amendment 2026-11-04): two limiter buckets. merchant_order_filter admits a
-- merchant's orders filter sentence before its model call (S35); agent_mcp is S37's per-token limit.
-- The sentence itself is stored nowhere: a limiter row holds a bucket, a subject and a time.
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp'));