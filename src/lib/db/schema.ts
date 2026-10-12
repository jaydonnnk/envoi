import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

// Every table lives in public. drizzle-orm refuses pgSchema("public"), so the schema pin is the
// web role's search_path, set per database in migration 0001 (R11 containment).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// Better Auth tables: library-owned users, accounts, durable sessions and the anonymous-user marker.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const authSchema = { user, session, account, verification };

// Catalogue. S1 holds only what the tracer reads; enrollment, memberships and destinations come later.

export const outlets = pgTable("outlets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area").notNull(),
  isDemoFixture: boolean("is_demo_fixture").notNull(),
  // Stable key the operator seed uses to find its fixture; null for any real outlet.
  fixtureKey: text("fixture_key").unique(),
  publishedMenuRevisionId: text("published_menu_revision_id").references((): AnyPgColumn => menuRevisions.id),
  createdAt: createdAt(),
});

export const menuRevisions = pgTable(
  "menu_revisions",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    status: text("status").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("menu_revisions_status_check", sql`${t.status} in ('draft', 'confirmed')`),
    index("menu_revisions_outlet_id_idx").on(t.outletId),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    menuRevisionId: text("menu_revision_id")
      .notNull()
      .references(() => menuRevisions.id),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    // Unknown price stays null; it never becomes zero.
    unitSgdCents: integer("unit_sgd_cents"),
    available: boolean("available"),
  },
  (t) => [
    check("menu_items_price_check", sql`${t.unitSgdCents} is null or ${t.unitSgdCents} > 0`),
    index("menu_items_revision_idx").on(t.menuRevisionId, t.position),
  ],
);

// Purchases. S1 stores only tracer reviews; S2 replaces the tracer with real pricing.

export type StoredLine = { menuItemId: string; name: string; quantity: number; unitSgdCents: number; lineSgdCents: number };

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    buyerUserId: text("buyer_user_id")
      .notNull()
      .references(() => user.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    menuRevisionId: text("menu_revision_id")
      .notNull()
      .references(() => menuRevisions.id),
    state: text("state").notNull(),
    entryPoint: text("entry_point").notNull(),
    lines: jsonb("lines").$type<StoredLine[]>().notNull(),
    totalSgdCents: integer("total_sgd_cents").notNull(),
    currency: text("currency").notNull(),
    reviewExpiresAt: timestamp("review_expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "purchases_state_check",
      sql`${t.state} in ('review_open', 'review_expired', 'review_invalidated', 'superseded', 'pending_payment', 'paid', 'unpaid_closed', 'uncertain')`,
    ),
    check("purchases_entry_point_check", sql`${t.entryPoint} in ('fixture_tracer')`),
    check("purchases_currency_check", sql`${t.currency} = 'SGD'`),
    check("purchases_total_check", sql`${t.totalSgdCents} > 0`),
    index("purchases_buyer_idx").on(t.buyerUserId),
  ],
);
