-- S29: the menu explained and translated (Gate 3 reopening 2026-10-29, second build plan). One row per
-- published menu revision and buyer language; a published revision never changes, so a row never goes
-- stale. The translation route admits each request under its own limiter key, menu_translation, which
-- the bucket check must allow.
-- Edited after generation: the web-role grant below is added. The web role may read and insert rows,
-- never update or delete them.
CREATE TABLE "menu_translations" (
	"menu_revision_id" text NOT NULL,
	"language" text NOT NULL,
	"items" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_translations_pkey" PRIMARY KEY("menu_revision_id","language"),
	CONSTRAINT "menu_translations_language_check" CHECK ("menu_translations"."language" ~ '^[a-z]{2,3}$')
);
--> statement-breakpoint
ALTER TABLE "rate_limit_hits" DROP CONSTRAINT "rate_limit_hits_bucket_check";--> statement-breakpoint
ALTER TABLE "menu_translations" ADD CONSTRAINT "menu_translations_menu_revision_id_menu_revisions_id_fk" FOREIGN KEY ("menu_revision_id") REFERENCES "public"."menu_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion', 'wallet_challenge', 'buyer_assistant', 'menu_translation'));--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."menu_translations" TO envoi_web;
