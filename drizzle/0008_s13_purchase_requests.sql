CREATE TABLE "agent_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agent_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "agent_tokens_hash_check" CHECK ("agent_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_token_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"outlet_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_user_id" text,
	"purchase_id" text,
	CONSTRAINT "purchase_requests_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "purchase_requests_hash_check" CHECK ("purchase_requests"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "purchase_requests_expiry_check" CHECK ("purchase_requests"."expires_at" > "purchase_requests"."created_at"),
	CONSTRAINT "purchase_requests_redemption_check" CHECK (("purchase_requests"."redeemed_at" is null and "purchase_requests"."redeemed_by_user_id" is null and "purchase_requests"."purchase_id" is null) or ("purchase_requests"."redeemed_at" is not null and "purchase_requests"."redeemed_by_user_id" is not null and "purchase_requests"."purchase_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_entry_point_check";--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_redeemed_by_user_id_user_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_requests_purchase_idx" ON "purchase_requests" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_requests_agent_idx" ON "purchase_requests" USING btree ("agent_token_id","created_at");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_entry_point_check" CHECK ("purchases"."entry_point" in ('fixture_tracer', 'manual', 'agent_handoff'));