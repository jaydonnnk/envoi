-- Edited after generation: the grants at the end are added (Gate 4 delta D7: S17 gives the web role
-- pyusd_extra_transfers, and gives the maintenance role the PYUSD attempt columns, pyusd_extra_transfers
-- and the RPC limiter rows). Neither role may write an extra transfer's refund reference: only the
-- operator act record-extra-transfer-refund, run with migration credentials, records one.
CREATE TABLE "pyusd_extra_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"signature" text NOT NULL,
	"slot" bigint NOT NULL,
	"destination_delta" bigint,
	"verification" text NOT NULL,
	"found_at" timestamp with time zone NOT NULL,
	"refund_reference" text,
	"refund_recorded_at" timestamp with time zone,
	"refund_recorded_by_user_id" text,
	CONSTRAINT "pyusd_extra_transfers_verification_check" CHECK ("pyusd_extra_transfers"."verification" in ('verified', 'metadata_incomplete', 'account_keys_unresolved', 'blockhash_mismatch', 'extra_signer', 'fee_payer_mismatch', 'transfer_count', 'mint_mismatch', 'decimals_mismatch', 'source_mismatch', 'destination_mismatch', 'amount_mismatch', 'memo_count', 'fee_nonzero_at_execution', 'balance_delta_mismatch', 'outer_instruction_not_allowlisted', 'lighthouse_not_assertion', 'inner_program_not_allowlisted', 'inner_instruction_not_allowlisted')),
	CONSTRAINT "pyusd_extra_transfers_refund_check" CHECK (("pyusd_extra_transfers"."refund_reference" is null and "pyusd_extra_transfers"."refund_recorded_at" is null and "pyusd_extra_transfers"."refund_recorded_by_user_id" is null) or (length(btrim("pyusd_extra_transfers"."refund_reference")) > 0 and "pyusd_extra_transfers"."refund_recorded_at" is not null and "pyusd_extra_transfers"."refund_recorded_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_scan" jsonb;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pyusd_mismatch_signature" text;--> statement-breakpoint
ALTER TABLE "pyusd_extra_transfers" ADD CONSTRAINT "pyusd_extra_transfers_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pyusd_extra_transfers" ADD CONSTRAINT "pyusd_extra_transfers_refund_recorded_by_user_id_user_id_fk" FOREIGN KEY ("refund_recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pyusd_extra_transfers_attempt_signature_unique" ON "pyusd_extra_transfers" USING btree ("attempt_id","signature");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pyusd_mismatch_check" CHECK ("payment_attempts"."state" <> 'mismatch' or "payment_attempts"."pyusd_mismatch_signature" is not null);--> statement-breakpoint
GRANT SELECT ON TABLE public."pyusd_extra_transfers" TO envoi_web, envoi_maintenance;--> statement-breakpoint
GRANT INSERT ("id", "attempt_id", "signature", "slot", "destination_delta", "verification", "found_at") ON TABLE public."pyusd_extra_transfers" TO envoi_web, envoi_maintenance;--> statement-breakpoint
GRANT UPDATE ("pyusd_scan", "pyusd_mismatch_signature") ON TABLE public."payment_attempts" TO envoi_web;--> statement-breakpoint
GRANT UPDATE ("pyusd_hints", "pyusd_finalized_signature", "pyusd_verified_at", "pyusd_scan", "pyusd_mismatch_signature") ON TABLE public."payment_attempts" TO envoi_maintenance;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE public."rpc_limiter_calls" TO envoi_maintenance;--> statement-breakpoint
GRANT SELECT ON TABLE public."rpc_limiter_slots", public."rpc_limiter_backoff" TO envoi_maintenance;--> statement-breakpoint
GRANT UPDATE ("holder", "lease_expires_at") ON TABLE public."rpc_limiter_slots" TO envoi_maintenance;--> statement-breakpoint
GRANT UPDATE ("until", "consecutive") ON TABLE public."rpc_limiter_backoff" TO envoi_maintenance;
