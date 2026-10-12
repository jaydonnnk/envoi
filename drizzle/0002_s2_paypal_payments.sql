CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"purchase_id" text,
	"attempt_id" text,
	"outlet_id" text,
	"operator_visible" boolean NOT NULL,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" text NOT NULL,
	"state" text NOT NULL,
	"payee_merchant_id" text NOT NULL,
	"total_sgd_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"create_request_id" text NOT NULL,
	"order_id" text,
	"approval_url" text,
	"capture_request_id" text,
	"capture_id" text,
	"capture_gross_sgd_cents" integer,
	"capture_verified_at" timestamp with time zone,
	"outcome_reason" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_create_request_id_unique" UNIQUE("create_request_id"),
	CONSTRAINT "payment_attempts_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payment_attempts_capture_request_id_unique" UNIQUE("capture_request_id"),
	CONSTRAINT "payment_attempts_capture_id_unique" UNIQUE("capture_id"),
	CONSTRAINT "payment_attempts_state_check" CHECK ("payment_attempts"."state" in ('created', 'order_created', 'externally_approved', 'capture_dispatched', 'capture_confirmed', 'capture_failed', 'create_unknown', 'capture_unknown', 'abandoned')),
	CONSTRAINT "payment_attempts_currency_check" CHECK ("payment_attempts"."currency" = 'SGD'),
	CONSTRAINT "payment_attempts_total_check" CHECK ("payment_attempts"."total_sgd_cents" > 0),
	CONSTRAINT "payment_attempts_capture_key_check" CHECK ("payment_attempts"."state" not in ('capture_dispatched', 'capture_confirmed', 'capture_unknown') or "payment_attempts"."capture_request_id" is not null),
	CONSTRAINT "payment_attempts_confirmed_check" CHECK ("payment_attempts"."state" <> 'capture_confirmed' or "payment_attempts"."capture_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"rail" text NOT NULL,
	"environment" text NOT NULL,
	"seller_merchant_id" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_destinations_rail_check" CHECK ("payment_destinations"."rail" in ('paypal')),
	CONSTRAINT "payment_destinations_environment_check" CHECK ("payment_destinations"."environment" = 'sandbox'),
	CONSTRAINT "payment_destinations_status_check" CHECK ("payment_destinations"."status" in ('active', 'disconnected')),
	CONSTRAINT "payment_destinations_version_check" CHECK ("payment_destinations"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_entry_point_check";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "rail" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "destination_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "destination_version" integer;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "checkout_key" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "supersedes_purchase_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_destinations" ADD CONSTRAINT "payment_destinations_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_purchase_idx" ON "audit_events" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "audit_events_operator_idx" ON "audit_events" USING btree ("operator_visible","at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_active" ON "payment_attempts" USING btree ("purchase_id") WHERE "payment_attempts"."state" not in ('abandoned', 'capture_failed', 'capture_confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_destinations_outlet_rail_unique" ON "payment_destinations" USING btree ("outlet_id","rail");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_destination_id_payment_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."payment_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supersedes_purchase_id_purchases_id_fk" FOREIGN KEY ("supersedes_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_one_open_review" ON "purchases" USING btree ("buyer_user_id","checkout_key") WHERE "purchases"."state" = 'review_open';--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_rail_check" CHECK ("purchases"."rail" is null or "purchases"."rail" in ('paypal', 'pyusd'));--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_binding_check" CHECK ("purchases"."entry_point" = 'fixture_tracer' or ("purchases"."rail" is not null and "purchases"."destination_id" is not null and "purchases"."destination_version" is not null and "purchases"."checkout_key" is not null));--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_entry_point_check" CHECK ("purchases"."entry_point" in ('fixture_tracer', 'manual'));