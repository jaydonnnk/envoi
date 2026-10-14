-- Custom SQL migration file, put your code below! --
-- Narrows the S6 INSERT grants of migration 0011 to the columns the web app writes, so the database
-- itself refuses what the app never does: an outlet born published or claiming a fixture key, an
-- enrollment born approved (status takes its 'pending' default; only the operator approves), and a
-- menu revision born confirmed (confirmed_at cannot be written, and menu_revisions_confirmed_check
-- requires it for a confirmed row).
REVOKE INSERT ON TABLE public."outlets", public."enrollments", public."menu_revisions" FROM envoi_web;
--> statement-breakpoint
GRANT INSERT ("id", "name", "area", "is_demo_fixture", "created_at") ON TABLE public."outlets" TO envoi_web;
--> statement-breakpoint
GRANT INSERT ("id", "outlet_id", "is_demo", "created_at") ON TABLE public."enrollments" TO envoi_web;
--> statement-breakpoint
GRANT INSERT ("id", "outlet_id", "status", "version", "created_at") ON TABLE public."menu_revisions" TO envoi_web;
