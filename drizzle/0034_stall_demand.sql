-- S48 (Gate 2 fourth build plan amendment, 2026-11-07, Data 3): a weekly count of scans for each
-- unenrolled sticker, under a keyed hash only, and the sticker_scan limiter bucket. No column holds a
-- name, sticker text, identifier, session, user, address or time beyond the week.
-- Edited after generation: the web-role grants below are added. The web role may read, insert and
-- raise a count; it can never delete a row or change its hash or week.
CREATE TABLE "sticker_scan_counts" (
	"sticker_hash" text NOT NULL,
	"week" date NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "sticker_scan_counts_sticker_hash_week_pk" PRIMARY KEY("sticker_hash","week"),
	CONSTRAINT "sticker_scan_counts_hash_check" CHECK ("sticker_scan_counts"."sticker_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sticker_scan_counts_count_check" CHECK ("sticker_scan_counts"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation', 'merchant_order_filter', 'agent_mcp', 'merchant_copilot', 'merchant_digest', 'sticker_scan'));--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."sticker_scan_counts" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("count") ON TABLE public."sticker_scan_counts" TO envoi_web;
