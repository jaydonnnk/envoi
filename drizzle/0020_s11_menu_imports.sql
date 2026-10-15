-- S11: menu photo import attempts and the admission singleton. No column holds an image byte, an
-- image hash, a URL or a file name.
-- Edited after generation: the singleton row and the web-role grants below are added (Gate 4 delta
-- D7). The web role inserts attempts and may update only the close, dispatch and usage columns; it
-- locks and stamps the singleton row on every admission and can neither add nor remove it.
CREATE TABLE "menu_import_admission" (
	"id" text PRIMARY KEY NOT NULL,
	"last_admitted_at" timestamp with time zone,
	CONSTRAINT "menu_import_admission_singleton_check" CHECK ("menu_import_admission"."id" = 'global')
);
--> statement-breakpoint
CREATE TABLE "menu_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"base_revision_id" text NOT NULL,
	"consent_version" text NOT NULL,
	"model_config_version" text NOT NULL,
	"admitted_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"model_dispatched_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_outcome" text,
	"reserved_usd_micros" bigint NOT NULL,
	"actual_usd_micros" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"rows_drafted" integer,
	"rows_blank_price" integer,
	"result_fingerprint" text,
	"latency_ms" integer,
	"peak_rss_bytes" bigint,
	CONSTRAINT "menu_imports_outcome_check" CHECK ("menu_imports"."closed_outcome" is null or "menu_imports"."closed_outcome" in ('completed', 'conflict_base_revision', 'conflict_confirmed', 'membership_revoked', 'rejected_upload', 'rejected_photo', 'model_failed', 'model_timeout', 'output_invalid', 'aborted')),
	CONSTRAINT "menu_imports_closed_check" CHECK (("menu_imports"."closed_at" is null) = ("menu_imports"."closed_outcome" is null)),
	CONSTRAINT "menu_imports_reserved_check" CHECK ("menu_imports"."reserved_usd_micros" >= 0),
	CONSTRAINT "menu_imports_deadline_check" CHECK ("menu_imports"."deadline_at" > "menu_imports"."admitted_at")
);
--> statement-breakpoint
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_base_revision_id_menu_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."menu_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_imports_outlet_admitted_idx" ON "menu_imports" USING btree ("outlet_id","admitted_at");--> statement-breakpoint
CREATE INDEX "menu_imports_admitted_idx" ON "menu_imports" USING btree ("admitted_at");;--> statement-breakpoint
INSERT INTO "menu_import_admission" ("id") VALUES ('global');--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."menu_imports" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("model_dispatched_at", "closed_at", "closed_outcome", "actual_usd_micros", "input_tokens", "output_tokens", "rows_drafted", "rows_blank_price", "result_fingerprint", "latency_ms", "peak_rss_bytes") ON TABLE public."menu_imports" TO envoi_web;--> statement-breakpoint
GRANT SELECT ON TABLE public."menu_import_admission" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("last_admitted_at") ON TABLE public."menu_import_admission" TO envoi_web;