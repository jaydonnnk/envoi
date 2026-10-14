-- Custom SQL migration file, put your code below! --
-- S13 grants for the least-privileged web role, a D7 extension the user approved as a refinement on
-- 2026-10-14. Agent tokens are inserted only by the operator CLI; the web app may look a digest up.
-- Purchase requests are created by the agent route and redeemed once by a buyer: column-level UPDATE
-- lets the web app bind the redemption and nothing else, so the suggested basket never changes.
GRANT SELECT ON TABLE public."agent_tokens" TO envoi_web;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."purchase_requests" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("redeemed_at", "redeemed_by_user_id", "purchase_id") ON TABLE public."purchase_requests" TO envoi_web;
