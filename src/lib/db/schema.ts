import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

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
    // Draft version (S6): every saved draft write increments it, and a write or confirmation based
    // on an older version is refused with revision_conflict and changes nothing.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    check("menu_revisions_status_check", sql`${t.status} in ('draft', 'confirmed')`),
    check("menu_revisions_confirmed_check", sql`(${t.status} = 'confirmed') = (${t.confirmedAt} is not null)`),
    check("menu_revisions_version_check", sql`${t.version} > 0`),
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
    portion: text("portion"),
    // Unknown price stays null; it never becomes zero.
    unitSgdCents: integer("unit_sgd_cents"),
    // Merchant-supplied availability; null is unknown, which blocks confirmation (S6).
    available: boolean("available"),
    source: text("source").notNull().default("merchant"),
  },
  (t) => [
    check("menu_items_price_check", sql`${t.unitSgdCents} is null or ${t.unitSgdCents} > 0`),
    check("menu_items_source_check", sql`${t.source} in ('merchant', 'import_suggestion')`),
    index("menu_items_revision_idx").on(t.menuRevisionId, t.position),
  ],
);

// Merchant memberships (Gate 2 data model; S6). Only the operator CLI inserts one, so every row is
// operator-approved. A row starts unbound (outlet_id null): the merchant's own outlet creation binds
// it to the new outlet in the same transaction, which is the only update the web role may make.
// Authorization reads these rows, never a property of the user record.

export const merchantMemberships = pgTable(
  "merchant_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    outletId: text("outlet_id").references(() => outlets.id),
    role: text("role").notNull(),
    isDemo: boolean("is_demo").notNull(),
    evidenceRef: text("evidence_ref"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("merchant_memberships_role_check", sql`${t.role} = 'owner'`),
    // One live membership per user and outlet, and at most one live unbound membership per user.
    uniqueIndex("merchant_memberships_live_outlet_unique").on(t.userId, t.outletId).where(sql`${t.outletId} is not null and ${t.revokedAt} is null`),
    uniqueIndex("merchant_memberships_live_unbound_unique").on(t.userId).where(sql`${t.outletId} is null and ${t.revokedAt} is null`),
    index("merchant_memberships_outlet_idx").on(t.outletId),
  ],
);

// Outlet enrollment with Envoi (Gate 2 data model). S6 opens one pending enrollment with each
// merchant-created outlet; only the operator approves it (S7, approve-enrollment).

export const enrollments = pgTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .unique()
      .references(() => outlets.id),
    // The web role cannot write this column (migration 0013), so an enrollment it creates is
    // always pending; only the operator approves one.
    status: text("status").notNull().default("pending"),
    isDemo: boolean("is_demo").notNull(),
    evidenceRef: text("evidence_ref"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("enrollments_status_check", sql`${t.status} in ('pending', 'approved')`),
    check("enrollments_approved_check", sql`(${t.status} = 'approved') = (${t.approvedAt} is not null)`),
  ],
);

// Payment destinations. Written only by the operator CLI, which creates one per outlet and rail and
// never replaces it (D1). The seller id is verified data, not a secret.

export const paymentDestinations = pgTable(
  "payment_destinations",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    rail: text("rail").notNull(),
    environment: text("environment").notNull(),
    sellerMerchantId: text("seller_merchant_id").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    check("payment_destinations_rail_check", sql`${t.rail} in ('paypal')`),
    check("payment_destinations_environment_check", sql`${t.environment} = 'sandbox'`),
    check("payment_destinations_status_check", sql`${t.status} in ('active', 'disconnected')`),
    check("payment_destinations_version_check", sql`${t.version} > 0`),
    uniqueIndex("payment_destinations_outlet_rail_unique").on(t.outletId, t.rail),
  ],
);

// Purchases. Tracer rows from S1 keep entry point fixture_tracer and carry no payment binding;
// every later review is bound to its rail, destination version and checkout key.

export type StoredLine = { menuItemId: string; name: string; quantity: number; unitSgdCents: number; lineSgdCents: number };

export const PURCHASE_STATES = [
  "review_open",
  "review_expired",
  "review_invalidated",
  "superseded",
  "pending_payment",
  "paid",
  "unpaid_closed",
  "uncertain",
] as const;

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
    rail: text("rail"),
    destinationId: text("destination_id").references(() => paymentDestinations.id),
    destinationVersion: integer("destination_version"),
    checkoutKey: text("checkout_key"),
    supersedesPurchaseId: text("supersedes_purchase_id").references((): AnyPgColumn => purchases.id),
  },
  (t) => [
    check(
      "purchases_state_check",
      sql`${t.state} in ('review_open', 'review_expired', 'review_invalidated', 'superseded', 'pending_payment', 'paid', 'unpaid_closed', 'uncertain')`,
    ),
    check("purchases_entry_point_check", sql`${t.entryPoint} in ('fixture_tracer', 'manual', 'agent_handoff')`),
    check("purchases_currency_check", sql`${t.currency} = 'SGD'`),
    check("purchases_total_check", sql`${t.totalSgdCents} > 0`),
    check("purchases_rail_check", sql`${t.rail} is null or ${t.rail} in ('paypal', 'pyusd')`),
    check(
      "purchases_binding_check",
      sql`${t.entryPoint} = 'fixture_tracer' or (${t.rail} is not null and ${t.destinationId} is not null and ${t.destinationVersion} is not null and ${t.checkoutKey} is not null)`,
    ),
    index("purchases_buyer_idx").on(t.buyerUserId),
    // One open review per buyer and checkout key (Gate 3 Races: two tabs create the same basket).
    uniqueIndex("purchases_one_open_review").on(t.buyerUserId, t.checkoutKey).where(sql`${t.state} = 'review_open'`),
  ],
);

// PayPal payment attempts. Operation keys are persisted before the provider call they name, and
// at most one attempt per purchase is outside a terminal state.

export const ATTEMPT_STATES = [
  "created",
  "order_created",
  "externally_approved",
  "capture_dispatched",
  "capture_confirmed",
  "capture_failed",
  "create_unknown",
  "capture_unknown",
  "abandoned",
] as const;

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchases.id),
    state: text("state").notNull(),
    // Snapshot of what the order must carry, taken from the purchase and its destination.
    payeeMerchantId: text("payee_merchant_id").notNull(),
    totalSgdCents: integer("total_sgd_cents").notNull(),
    currency: text("currency").notNull(),
    createRequestId: text("create_request_id").notNull().unique(),
    orderId: text("order_id").unique(),
    approvalUrl: text("approval_url"),
    captureRequestId: text("capture_request_id").unique(),
    captureId: text("capture_id").unique(),
    captureGrossSgdCents: integer("capture_gross_sgd_cents"),
    captureVerifiedAt: timestamp("capture_verified_at", { withTimezone: true }),
    outcomeReason: text("outcome_reason"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    // Recovery (S3): a verified webhook marks a provider read as due; the last bounded read starts
    // the T_PROVIDER_READ_DEBOUNCE window for the status and reconcile paths.
    providerReadDueAt: timestamp("provider_read_due_at", { withTimezone: true }),
    lastProviderReadAt: timestamp("last_provider_read_at", { withTimezone: true }),
    // Maintenance (S5): a runner's claim on this attempt as due work, held for T_LEASE, so
    // overlapping runs take disjoint attempts; and how often and when maintenance last checked it.
    maintenanceClaimOwner: text("maintenance_claim_owner"),
    maintenanceClaimExpiresAt: timestamp("maintenance_claim_expires_at", { withTimezone: true }),
    maintenanceChecks: integer("maintenance_checks").notNull().default(0),
    maintenanceCheckedAt: timestamp("maintenance_checked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "payment_attempts_state_check",
      sql`${t.state} in ('created', 'order_created', 'externally_approved', 'capture_dispatched', 'capture_confirmed', 'capture_failed', 'create_unknown', 'capture_unknown', 'abandoned')`,
    ),
    check("payment_attempts_currency_check", sql`${t.currency} = 'SGD'`),
    check("payment_attempts_total_check", sql`${t.totalSgdCents} > 0`),
    // A capture is never dispatched without its request id persisted first.
    check(
      "payment_attempts_capture_key_check",
      sql`${t.state} not in ('capture_dispatched', 'capture_confirmed', 'capture_unknown') or ${t.captureRequestId} is not null`,
    ),
    check("payment_attempts_confirmed_check", sql`${t.state} <> 'capture_confirmed' or ${t.captureId} is not null`),
    // One non-terminal attempt per purchase (Gate 3 Races: double click on "continue to PayPal").
    uniqueIndex("payment_attempts_one_active")
      .on(t.purchaseId)
      .where(sql`${t.state} not in ('abandoned', 'capture_failed', 'capture_confirmed')`),
  ],
);

// Verified PayPal webhook inbox. One row per provider event id: a duplicate delivery inserts
// nothing and changes nothing. Rows hold identifiers and the disposition only, never the event
// body. Event content never marks anything paid; it can only make a provider read due.

export const PROVIDER_EVENT_DISPOSITIONS = ["read_due", "quarantined_unknown_order", "no_order"] as const;

export const providerEvents = pgTable(
  "provider_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type").notNull(),
    orderId: text("order_id"),
    attemptId: text("attempt_id").references(() => paymentAttempts.id),
    disposition: text("disposition").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("provider_events_provider_check", sql`${t.provider} = 'paypal'`),
    check("provider_events_disposition_check", sql`${t.disposition} in ('read_due', 'quarantined_unknown_order', 'no_order')`),
    check("provider_events_known_order_check", sql`${t.disposition} <> 'read_due' or ${t.attemptId} is not null`),
    // Gate 3 Races: duplicate or out-of-order webhook.
    uniqueIndex("provider_events_event_id_unique").on(t.provider, t.eventId),
  ],
);

// Append-only audit trail: the web role may insert but never update or delete. Details hold
// allowlisted identifiers and reasons only, never provider bodies, tokens or personal data.

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    purchaseId: text("purchase_id"),
    attemptId: text("attempt_id"),
    outletId: text("outlet_id"),
    operatorVisible: boolean("operator_visible").notNull(),
    details: jsonb("details").$type<Record<string, string | number | boolean | null>>().notNull(),
  },
  (t) => [index("audit_events_purchase_idx").on(t.purchaseId), index("audit_events_operator_idx").on(t.operatorVisible, t.at)],
);

// Public-route limiter (Gate 4 delta D9). One row per admitted request; a refused request writes
// nothing. Admission prunes rows older than the bucket's longest window, so the table stays small
// without a maintenance task.

export const RATE_LIMIT_BUCKETS = ["buyer_suggestion"] as const;

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: text("id").primaryKey(),
    bucket: text("bucket").notNull(),
    subject: text("subject").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("rate_limit_hits_bucket_check", sql`${t.bucket} in ('buyer_suggestion')`),
    index("rate_limit_hits_bucket_at_idx").on(t.bucket, t.at),
    index("rate_limit_hits_subject_idx").on(t.bucket, t.subject, t.at),
  ],
);

// Agent bearer tokens (Gate 2 "Supported MCP clients"; S13). The operator CLI inserts one per
// supported client and prints the token once; only its SHA-256 digest is stored. The web role may
// only look a digest up. Scope is fixed in code: search_outlets, get_menu, create_purchase_request.

export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [check("agent_tokens_hash_check", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`)],
);

// Agent purchase requests (Gate 2 data model; Gate 3 "Suggestions and handoffs"). A request holds
// the suggested outlet and item ids with quantities, never a price or total: redemption prices the
// basket afresh. The handoff token is stored only as its digest. Redemption binds the buyer and the
// purchase it created, once.

export type SuggestedLine = { menuItemId: string; quantity: number };

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: text("id").primaryKey(),
    agentTokenId: text("agent_token_id")
      .notNull()
      .references(() => agentTokens.id),
    tokenHash: text("token_hash").notNull().unique(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    lines: jsonb("lines").$type<SuggestedLine[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedByUserId: text("redeemed_by_user_id").references(() => user.id),
    purchaseId: text("purchase_id").references(() => purchases.id),
  },
  (t) => [
    check("purchase_requests_hash_check", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("purchase_requests_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
    // Redeemed means all three bindings at once, or none of them.
    check(
      "purchase_requests_redemption_check",
      sql`(${t.redeemedAt} is null and ${t.redeemedByUserId} is null and ${t.purchaseId} is null) or (${t.redeemedAt} is not null and ${t.redeemedByUserId} is not null and ${t.purchaseId} is not null)`,
    ),
    // Not unique: a redemption that finds the buyer's same basket already open binds that review.
    index("purchase_requests_purchase_idx").on(t.purchaseId),
    index("purchase_requests_agent_idx").on(t.agentTokenId, t.createdAt),
  ],
);

// Maintenance runs (S5). The row is the heartbeat: the runner inserts it first and finishes it
// with its report. The operator health view reads the latest one; no import or payment admission
// depends on it.

export const MAINTENANCE_TRIGGERS = ["manual", "scheduled"] as const;
export const MAINTENANCE_RUN_STATUSES = ["running", "ok", "failed"] as const;

export type MaintenanceReportJson = {
  tasks: { name: string; status: "ok" | "partial" | "failed"; processed: number; reason: string | null }[];
  operatorVisible: boolean;
};

export const maintenanceRuns = pgTable(
  "maintenance_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // pg_database_size(current_database()): excludes Neon's history and restore storage.
    databaseSizeBytes: bigint("database_size_bytes", { mode: "number" }),
    report: jsonb("report").$type<MaintenanceReportJson>(),
  },
  (t) => [
    check("maintenance_runs_trigger_check", sql`${t.trigger} in ('manual', 'scheduled')`),
    check("maintenance_runs_status_check", sql`${t.status} in ('running', 'ok', 'failed')`),
    check("maintenance_runs_finished_check", sql`(${t.status} = 'running') = (${t.finishedAt} is null)`),
    index("maintenance_runs_started_idx").on(t.startedAt),
  ],
);

// Operator allowlist (S5; Gate 3 "allowlisted flag on a permanent account"). Only the operator CLI's
// grant-operator writes it; the web role may only read it, so no web or Better Auth path can make an
// account an operator. A grant never comes from a property of the user record.

export const operatorGrants = pgTable(
  "operator_grants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    evidenceRef: text("evidence_ref"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("operator_grants_live_user_unique").on(t.userId).where(sql`${t.revokedAt} is null`)],
);
