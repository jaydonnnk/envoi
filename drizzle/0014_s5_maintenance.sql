CREATE TABLE "maintenance_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"database_size_bytes" bigint,
	"report" jsonb,
	CONSTRAINT "maintenance_runs_trigger_check" CHECK ("maintenance_runs"."trigger" in ('manual', 'scheduled')),
	CONSTRAINT "maintenance_runs_status_check" CHECK ("maintenance_runs"."status" in ('running', 'ok', 'failed')),
	CONSTRAINT "maintenance_runs_finished_check" CHECK (("maintenance_runs"."status" = 'running') = ("maintenance_runs"."finished_at" is null))
);
--> statement-breakpoint
CREATE TABLE "operator_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"evidence_ref" text,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "maintenance_claim_owner" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "maintenance_claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "maintenance_checks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "maintenance_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operator_grants" ADD CONSTRAINT "operator_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_runs_started_idx" ON "maintenance_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_grants_live_user_unique" ON "operator_grants" USING btree ("user_id") WHERE "operator_grants"."revoked_at" is null;