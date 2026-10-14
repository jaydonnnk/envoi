-- S5 grants (Gate 4 delta D7). The envoi_maintenance role is created out of band under a named
-- authorization, before this migration runs, as envoi_web was in S1.

-- Web role: the operator health view reads runs, and requireOperator reads the allowlist.
GRANT SELECT ON TABLE public."maintenance_runs", public."operator_grants" TO envoi_web;
--> statement-breakpoint

-- Maintenance role: heartbeat and report, due-work claims, read-only PayPal reconciliation of
-- existing attempts, closing expired reviews and purging expired sessions. It may not insert an
-- attempt, write an order id or a capture request id, or touch prices, baskets, menus or outlets,
-- so it cannot create or dispatch a payment even with its own credential.
GRANT USAGE ON SCHEMA public TO envoi_maintenance;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ("status", "finished_at", "database_size_bytes", "report") ON TABLE public."maintenance_runs" TO envoi_maintenance;
--> statement-breakpoint
GRANT SELECT ON TABLE public."payment_attempts", public."purchases" TO envoi_maintenance;
--> statement-breakpoint
GRANT UPDATE ("state", "updated_at", "capture_id", "capture_gross_sgd_cents", "capture_verified_at", "outcome_reason", "lease_owner", "lease_expires_at", "provider_read_due_at", "last_provider_read_at", "maintenance_claim_owner", "maintenance_claim_expires_at", "maintenance_checks", "maintenance_checked_at") ON TABLE public."payment_attempts" TO envoi_maintenance;
--> statement-breakpoint
GRANT UPDATE ("state") ON TABLE public."purchases" TO envoi_maintenance;
--> statement-breakpoint
GRANT INSERT ON TABLE public."audit_events" TO envoi_maintenance;
--> statement-breakpoint
GRANT SELECT ("id", "expires_at"), DELETE ON TABLE public."session" TO envoi_maintenance;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('ALTER ROLE envoi_maintenance IN DATABASE %I SET search_path TO public', current_database());
END
$$;
