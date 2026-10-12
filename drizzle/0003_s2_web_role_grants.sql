-- Custom SQL migration file, put your code below! --
-- S2 grants for the least-privileged web role (Gate 4 delta D7). Column-level UPDATE keeps every
-- other column immutable to the web app: a purchase's basket, total and bindings never change.
GRANT SELECT ON TABLE public."payment_destinations" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("state") ON TABLE public."purchases" TO envoi_web;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."payment_attempts" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("state", "order_id", "approval_url", "capture_request_id", "capture_id", "capture_gross_sgd_cents", "capture_verified_at", "outcome_reason", "lease_owner", "lease_expires_at", "updated_at") ON TABLE public."payment_attempts" TO envoi_web;
--> statement-breakpoint
-- Append-only: no SELECT, UPDATE or DELETE for the web role.
GRANT INSERT ON TABLE public."audit_events" TO envoi_web;
