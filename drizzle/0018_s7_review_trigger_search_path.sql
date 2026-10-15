-- S7 review fix (M2): the four trigger functions of migration 0017 that had no fixed search path
-- resolve their unqualified table names through the caller's search path, where pg_temp comes first,
-- so a temporary table named menu_revisions could shadow the real one and let a published item
-- change. Each now runs with the same fixed path as envoi_outlet_publication_guard: public first,
-- pg_temp last.
ALTER FUNCTION envoi_published_items_immutable() SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION envoi_published_revision_immutable() SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION envoi_membership_binding_once() SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION envoi_menu_item_key_default() SET search_path = public, pg_temp;
