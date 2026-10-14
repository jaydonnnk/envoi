-- Custom SQL migration file, put your code below! --
-- S7 publication guards, backfills and web-role grants (Gate 4 delta D7, and the S6 review advisory
-- the user decided on 2026-10-14). Every guard below holds for every role, so a published menu and a
-- bound membership are protected by the database, not only by the web app's queries.

-- A revision an outlet already publishes was published when it was confirmed.
UPDATE "menu_revisions" SET "published_at" = coalesce("menu_revisions"."confirmed_at", "menu_revisions"."created_at")
FROM "outlets" WHERE "outlets"."published_menu_revision_id" = "menu_revisions"."id";
--> statement-breakpoint

-- The basket lock key of every bound purchase, in exactly the form computeBasketLockKey hashes:
-- SHA-256 hex of "basket-lock-v1", buyer, outlet and the "itemKey:quantity" lines sorted by item key
-- in byte order, joined by newlines and the lines by commas. Item keys equal item ids before S7.
UPDATE "purchases" SET "basket_lock_key" = encode(sha256(convert_to(
  'basket-lock-v1' || E'\n' || "purchases"."buyer_user_id" || E'\n' || "purchases"."outlet_id" || E'\n' || (
    SELECT string_agg(coalesce(i."item_key", l.value->>'menuItemId') || ':' || (l.value->>'quantity'), ',' ORDER BY coalesce(i."item_key", l.value->>'menuItemId') COLLATE "C")
    FROM jsonb_array_elements("purchases"."lines") AS l(value)
    LEFT JOIN "menu_items" i ON i."id" = l.value->>'menuItemId'
  ), 'UTF8')), 'hex')
WHERE "purchases"."checkout_key" IS NOT NULL AND "purchases"."basket_lock_key" IS NULL;
--> statement-breakpoint

-- An item inserted without a key is its own first version: the key is its id.
CREATE FUNCTION envoi_menu_item_key_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.item_key := coalesce(NEW.item_key, NEW.id);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER menu_items_item_key_default BEFORE INSERT ON "menu_items" FOR EACH ROW EXECUTE FUNCTION envoi_menu_item_key_default();
--> statement-breakpoint

-- A revision that was ever published refuses every update and delete.
CREATE FUNCTION envoi_published_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'menu revision % was published and cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER menu_revisions_published_immutable BEFORE UPDATE OR DELETE ON "menu_revisions" FOR EACH ROW EXECUTE FUNCTION envoi_published_revision_immutable();
--> statement-breakpoint

-- The items of a revision that was ever published refuse every insert, update and delete.
CREATE FUNCTION envoi_published_items_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM "menu_revisions" WHERE "id" = OLD.menu_revision_id AND "published_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'menu item % belongs to a published revision and cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM "menu_revisions" WHERE "id" = NEW.menu_revision_id AND "published_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'menu item % belongs to a published revision and cannot change', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER menu_items_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON "menu_items" FOR EACH ROW EXECUTE FUNCTION envoi_published_items_immutable();
--> statement-breakpoint

-- The published pointer may only name a confirmed revision of the same outlet, and naming one marks
-- it published. A pointer is never cleared: S7 has no unpublish. SECURITY DEFINER lets the web role
-- mark the revision without holding UPDATE on published_at; the search path is fixed.
CREATE FUNCTION envoi_outlet_publication_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.published_menu_revision_id IS NOT DISTINCT FROM OLD.published_menu_revision_id THEN
    RETURN NEW;
  END IF;
  IF NEW.published_menu_revision_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'outlet % cannot be unpublished', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  SELECT "outlet_id", "status" INTO target FROM "menu_revisions" WHERE "id" = NEW.published_menu_revision_id FOR UPDATE;
  IF NOT FOUND OR target.outlet_id <> NEW.id OR target.status <> 'confirmed' THEN
    RAISE EXCEPTION 'outlet % may only publish a confirmed revision of its own', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "menu_revisions" SET "published_at" = now() WHERE "id" = NEW.published_menu_revision_id AND "published_at" IS NULL;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION envoi_outlet_publication_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER outlets_publication_guard BEFORE INSERT OR UPDATE OF "published_menu_revision_id" ON "outlets" FOR EACH ROW EXECUTE FUNCTION envoi_outlet_publication_guard();
--> statement-breakpoint

-- A membership only goes from unbound to bound: once it names an outlet, it never names another.
CREATE FUNCTION envoi_membership_binding_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.outlet_id IS NOT NULL AND NEW.outlet_id IS DISTINCT FROM OLD.outlet_id THEN
    RAISE EXCEPTION 'membership % is already bound to an outlet', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER merchant_memberships_binding_once BEFORE UPDATE ON "merchant_memberships" FOR EACH ROW EXECUTE FUNCTION envoi_membership_binding_once();
--> statement-breakpoint

-- Web role: confirm outlet details, switch the published pointer (checked by the trigger above) and
-- accept the operator-prepared PayPal connection, raising its version. It still cannot write a
-- seller id, a destination status or an item key.
GRANT UPDATE ("details_confirmed_at", "published_menu_revision_id") ON TABLE public."outlets" TO envoi_web;
--> statement-breakpoint
GRANT UPDATE ("accepted_at", "accepted_by_user_id", "version") ON TABLE public."payment_destinations" TO envoi_web;
