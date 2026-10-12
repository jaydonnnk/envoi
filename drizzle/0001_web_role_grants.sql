-- Custom SQL migration file, put your code below! --
-- Least-privileged web role (Gate 4 delta D7). The role itself is created out of band under a
-- named authorization; this migration fails if it does not exist.
GRANT USAGE ON SCHEMA public TO envoi_web;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."user", public."session", public."account", public."verification" TO envoi_web;
--> statement-breakpoint
GRANT SELECT ON TABLE public."outlets", public."menu_revisions", public."menu_items" TO envoi_web;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public."purchases" TO envoi_web;
--> statement-breakpoint
-- R11 containment: pin the web role to public in this database, so no unqualified Better Auth
-- name can resolve into neon_auth whatever the database-level search_path says.
DO $$
BEGIN
  EXECUTE format('ALTER ROLE envoi_web IN DATABASE %I SET search_path TO public', current_database());
END
$$;
