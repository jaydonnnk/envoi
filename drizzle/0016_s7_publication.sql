-- Edited after generation: existing items exist, so the item key is added nullable, set to each
-- item's own id and only then made NOT NULL.
ALTER TABLE "menu_items" ADD COLUMN "item_key" text;--> statement-breakpoint
UPDATE "menu_items" SET "item_key" = "id";--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "item_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "details_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD COLUMN "accepted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "basket_lock_key" text;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_revision_item_key_unique" ON "menu_items" USING btree ("menu_revision_id","item_key");--> statement-breakpoint
CREATE INDEX "purchases_basket_lock_key_idx" ON "purchases" USING btree ("basket_lock_key");--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD CONSTRAINT "menu_revisions_published_check" CHECK ("menu_revisions"."published_at" is null or "menu_revisions"."status" = 'confirmed');--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_accepted_check" CHECK (("payment_destinations"."accepted_at" is null) = ("payment_destinations"."accepted_by_user_id" is null));