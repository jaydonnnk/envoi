-- S24: web menu import (Gate 3 reopening 2026-10-29). A menu import records what it read: a photo, or
-- a web page by its host only, never the full URL or the page text. The outcome check gains the four
-- web outcomes (page_refused, page_timeout, page_unreachable, picture_menu), which the closing write
-- needs. No new grant: the web role already inserts into menu_imports.
ALTER TABLE "menu_imports" DROP CONSTRAINT "menu_imports_outcome_check";--> statement-breakpoint
ALTER TABLE "menu_imports" ADD COLUMN "source" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_imports" ADD COLUMN "source_host" text;--> statement-breakpoint
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_source_check" CHECK ("menu_imports"."source" in ('photo', 'web_page') and ("menu_imports"."source_host" is null or length("menu_imports"."source_host") <= 253));--> statement-breakpoint
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_outcome_check" CHECK ("menu_imports"."closed_outcome" is null or "menu_imports"."closed_outcome" in ('completed', 'conflict_base_revision', 'conflict_confirmed', 'membership_revoked', 'rejected_upload', 'rejected_photo', 'model_failed', 'model_timeout', 'output_invalid', 'aborted', 'page_refused', 'page_timeout', 'page_unreachable', 'picture_menu'));