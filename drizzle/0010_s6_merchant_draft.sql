CREATE TABLE "enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"status" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"evidence_ref" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_outlet_id_unique" UNIQUE("outlet_id"),
	CONSTRAINT "enrollments_status_check" CHECK ("enrollments"."status" in ('pending', 'approved')),
	CONSTRAINT "enrollments_approved_check" CHECK (("enrollments"."status" = 'approved') = ("enrollments"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "merchant_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"outlet_id" text,
	"role" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"evidence_ref" text,
	"approved_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_memberships_role_check" CHECK ("merchant_memberships"."role" = 'owner')
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "portion" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "source" text DEFAULT 'merchant' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_memberships" ADD CONSTRAINT "merchant_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_memberships" ADD CONSTRAINT "merchant_memberships_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_memberships_live_outlet_unique" ON "merchant_memberships" USING btree ("user_id","outlet_id") WHERE "merchant_memberships"."outlet_id" is not null and "merchant_memberships"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_memberships_live_unbound_unique" ON "merchant_memberships" USING btree ("user_id") WHERE "merchant_memberships"."outlet_id" is null and "merchant_memberships"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "merchant_memberships_outlet_idx" ON "merchant_memberships" USING btree ("outlet_id");--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_source_check" CHECK ("menu_items"."source" in ('merchant', 'import_suggestion'));--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD CONSTRAINT "menu_revisions_confirmed_check" CHECK (("menu_revisions"."status" = 'confirmed') = ("menu_revisions"."confirmed_at" is not null));--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD CONSTRAINT "menu_revisions_version_check" CHECK ("menu_revisions"."version" > 0);