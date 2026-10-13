CREATE TABLE "rate_limit_hits" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"subject" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_hits_bucket_check" CHECK ("rate_limit_hits"."bucket" in ('buyer_suggestion'))
);
--> statement-breakpoint
CREATE INDEX "rate_limit_hits_bucket_at_idx" ON "rate_limit_hits" USING btree ("bucket","at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_subject_idx" ON "rate_limit_hits" USING btree ("bucket","subject","at");