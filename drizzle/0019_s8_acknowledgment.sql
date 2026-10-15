-- S8: the merchant's acknowledgment of a paid order, its own field beside the payment state.
-- Edited after generation: the web-role grant below is added (Gate 4 delta D7). The web role may
-- write only the two acknowledgment columns here; its existing UPDATE ("state") grant is unchanged.
ALTER TABLE "purchases" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "acknowledged_by_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_acknowledged_by_user_id_user_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_outlet_created_idx" ON "purchases" USING btree ("outlet_id","created_at");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_acknowledged_check" CHECK (("purchases"."acknowledged_at" is null) = ("purchases"."acknowledged_by_user_id" is null));--> statement-breakpoint
GRANT UPDATE ("acknowledged_at", "acknowledged_by_user_id") ON TABLE public."purchases" TO envoi_web;
