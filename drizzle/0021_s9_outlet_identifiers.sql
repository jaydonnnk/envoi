-- Edited after generation: the web-role grants below are added (Gate 4 delta D7, refined in S9).
-- The web role reads mappings and inserts a pending one, naming only these columns: approved_at and
-- evidence_ref take their null default, and no UPDATE or DELETE is granted, so only the operator CLI,
-- which runs with the migration role, approves a mapping.
CREATE TABLE "outlet_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"scheme" text NOT NULL,
	"identifier" text NOT NULL,
	"distinguisher" text NOT NULL,
	"source" text NOT NULL,
	"checksum_valid" boolean,
	"submitted_by_user_id" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"evidence_ref" text,
	CONSTRAINT "outlet_identifiers_scheme_check" CHECK ("outlet_identifiers"."scheme" = 'paynow_uen'),
	CONSTRAINT "outlet_identifiers_source_check" CHECK ("outlet_identifiers"."source" in ('sticker', 'corrected', 'manual')),
	CONSTRAINT "outlet_identifiers_checksum_check" CHECK (("outlet_identifiers"."source" = 'manual') = ("outlet_identifiers"."checksum_valid" is null))
);
--> statement-breakpoint
ALTER TABLE "outlet_identifiers" ADD CONSTRAINT "outlet_identifiers_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_identifiers" ADD CONSTRAINT "outlet_identifiers_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outlet_identifiers_outlet_identifier_unique" ON "outlet_identifiers" USING btree ("outlet_id","scheme","identifier");--> statement-breakpoint
CREATE INDEX "outlet_identifiers_identifier_idx" ON "outlet_identifiers" USING btree ("scheme","identifier");
--> statement-breakpoint
GRANT SELECT ON TABLE public."outlet_identifiers" TO envoi_web;--> statement-breakpoint
GRANT INSERT ("id", "outlet_id", "scheme", "identifier", "distinguisher", "source", "checksum_valid", "submitted_by_user_id", "submitted_at") ON TABLE public."outlet_identifiers" TO envoi_web;
