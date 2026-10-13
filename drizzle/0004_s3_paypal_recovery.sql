CREATE TABLE "provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"order_id" text,
	"attempt_id" text,
	"disposition" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_events_provider_check" CHECK ("provider_events"."provider" = 'paypal'),
	CONSTRAINT "provider_events_disposition_check" CHECK ("provider_events"."disposition" in ('read_due', 'quarantined_unknown_order', 'no_order')),
	CONSTRAINT "provider_events_known_order_check" CHECK ("provider_events"."disposition" <> 'read_due' or "provider_events"."attempt_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_read_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "last_provider_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_event_id_unique" ON "provider_events" USING btree ("provider","event_id");