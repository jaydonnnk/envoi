-- Custom SQL migration file, put your code below! --
-- S6 grants for the least-privileged web role (Gate 4 delta D7). Memberships are inserted only by
-- the operator CLI; the web app reads them and may bind an unbound one to the outlet its merchant
-- creates, and nothing else. Merchant-created outlets open a pending enrollment that only the
-- operator approves. Column-level UPDATE grants keep the published pointer, outlet ownership and
-- item-to-revision links out of the web role's reach.
GRANT SELECT ON TABLE public."merchant_memberships" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("outlet_id") ON TABLE public."merchant_memberships" TO envoi_web;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."enrollments" TO envoi_web;
--> statement-breakpoint
GRANT INSERT ON TABLE public."outlets" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("name", "area") ON TABLE public."outlets" TO envoi_web;
--> statement-breakpoint
GRANT INSERT ON TABLE public."menu_revisions" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("status", "confirmed_at", "version") ON TABLE public."menu_revisions" TO envoi_web;
--> statement-breakpoint
GRANT INSERT, DELETE ON TABLE public."menu_items" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("position", "name", "portion", "unit_sgd_cents", "available", "source") ON TABLE public."menu_items" TO envoi_web;
