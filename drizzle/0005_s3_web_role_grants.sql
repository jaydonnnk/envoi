-- Custom SQL migration file, put your code below! --
-- S3 grants for the least-privileged web role (Gate 4 delta D7). The webhook inbox is insert and
-- read only: a stored event is never rewritten or deleted by the web app.
GRANT SELECT, INSERT ON TABLE public."provider_events" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("provider_read_due_at", "last_provider_read_at") ON TABLE public."payment_attempts" TO envoi_web;
