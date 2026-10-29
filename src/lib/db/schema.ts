import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

// Every table lives in public. drizzle-orm refuses pgSchema("public"), so the schema pin is the
// web role's search_path, set per database in migration 0001 (R11 containment).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// Raw bytes, read back as a Uint8Array exactly as written.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

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
  // Outlet confirmation (S7): the merchant reviewed exactly the current name and area. Any edit of
  // either clears it, and publication requires it.
  detailsConfirmedAt: timestamp("details_confirmed_at", { withTimezone: true }),
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
    // Set once, by the database, when an outlet's published pointer first names this revision (S7,
    // migration 0017). From then on the revision and its items refuse every write: editing a
    // published menu creates a new, unpublished revision.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("menu_revisions_status_check", sql`${t.status} in ('draft', 'confirmed')`),
    check("menu_revisions_confirmed_check", sql`(${t.status} = 'confirmed') = (${t.confirmedAt} is not null)`),
    check("menu_revisions_version_check", sql`${t.version} > 0`),
    check("menu_revisions_published_check", sql`${t.publishedAt} is null or ${t.status} = 'confirmed'`),
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
    // The item's identity across revisions (S7). A new item's key is its own id; a revision copied
    // from the published one keeps each item's key, so "the same lines" of a basket are recognized
    // on a republished menu. The web role may insert it but never update it.
    itemKey: text("item_key").notNull(),
  },
  (t) => [
    check("menu_items_price_check", sql`${t.unitSgdCents} is null or ${t.unitSgdCents} > 0`),
    check("menu_items_source_check", sql`${t.source} in ('merchant', 'import_suggestion')`),
    index("menu_items_revision_idx").on(t.menuRevisionId, t.position),
    uniqueIndex("menu_items_revision_item_key_unique").on(t.menuRevisionId, t.itemKey),
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

// Outlet identifier mappings (S9). The merchant submits one through the outlet edit route; it stays
// pending until the operator CLI's approve-identifier sets approved_at, which the web role can
// neither insert nor update (migration 0021). Only a business UEN can be stored: a personal PayNow
// proxy is refused before the write and by the scheme check. The QR payload itself is never stored;
// source and checksum_valid record what the server decoded from it.
export const outletIdentifiers = pgTable(
  "outlet_identifiers",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    scheme: text("scheme").notNull(),
    identifier: text("identifier").notNull(),
    // What tells this outlet apart from others that share the identifier, in the merchant's words.
    distinguisher: text("distinguisher").notNull(),
    // sticker: the identifier is one the server decoded from the submitted sticker; corrected: a
    // sticker was decoded but the merchant changed the identifier; manual: no sticker was submitted.
    source: text("source").notNull(),
    checksumValid: boolean("checksum_valid"),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => user.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    evidenceRef: text("evidence_ref"),
  },
  (t) => [
    check("outlet_identifiers_scheme_check", sql`${t.scheme} = 'paynow_uen'`),
    check("outlet_identifiers_source_check", sql`${t.source} in ('sticker', 'corrected', 'manual')`),
    check("outlet_identifiers_checksum_check", sql`(${t.source} = 'manual') = (${t.checksumValid} is null)`),
    uniqueIndex("outlet_identifiers_outlet_identifier_unique").on(t.outletId, t.scheme, t.identifier),
    index("outlet_identifiers_identifier_idx").on(t.scheme, t.identifier),
  ],
);

// Payment destinations. A PayPal row is written only by the operator CLI, which creates one per
// outlet and never replaces it (D1); the seller id is verified data, not a secret. A PYUSD row (S16)
// is written by the outlet's merchant through a verified wallet proof: it records key control of the
// wallet and the derived Token-2022 account for the pinned devnet mint, never a pasted account.

export const paymentDestinations = pgTable(
  "payment_destinations",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    rail: text("rail").notNull(),
    environment: text("environment").notNull(),
    // PayPal only.
    sellerMerchantId: text("seller_merchant_id"),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    // The outlet's merchant selected this operator-prepared connection (S7). Acceptance raises the
    // version, so a review pinned to the earlier version is invalidated at execution.
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id),
    // PYUSD only (S16): the wallet whose key signed the saved challenge, its derived associated
    // Token-2022 account for the pinned mint, and when and by whom the proof was verified. Each new
    // proof raises the version, so a review pinned to the earlier version fails at preparation.
    walletAddress: text("wallet_address"),
    tokenAccount: text("token_account"),
    keyVerifiedAt: timestamp("key_verified_at", { withTimezone: true }),
    keyVerifiedByUserId: text("key_verified_by_user_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("payment_destinations_accepted_check", sql`(${t.acceptedAt} is null) = (${t.acceptedByUserId} is null)`),
    check("payment_destinations_rail_check", sql`${t.rail} in ('paypal', 'pyusd')`),
    check("payment_destinations_environment_check", sql`${t.environment} in ('sandbox', 'devnet')`),
    // PayPal: a sandbox seller and no wallet. PYUSD: devnet, a verified wallet and account, no seller.
    check(
      "payment_destinations_rail_fields_check",
      sql`(${t.rail} = 'paypal' and ${t.environment} = 'sandbox' and ${t.sellerMerchantId} is not null and ${t.walletAddress} is null and ${t.tokenAccount} is null and ${t.keyVerifiedAt} is null) or (${t.rail} = 'pyusd' and ${t.environment} = 'devnet' and ${t.sellerMerchantId} is null and ${t.walletAddress} is not null and ${t.tokenAccount} is not null and ${t.keyVerifiedAt} is not null and ${t.keyVerifiedByUserId} is not null and ${t.acceptedAt} is null)`,
    ),
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
    // Rail-independent basket identity (Gate 3 BasketLockKey; S7): buyer, outlet and item keys with
    // quantities, without rail, destination or menu revision. Immutable like the lines it hashes.
    basketLockKey: text("basket_lock_key"),
    supersedesPurchaseId: text("supersedes_purchase_id").references((): AnyPgColumn => purchases.id),
    // The merchant's acknowledgment (S8), its own field beside the payment state: it never changes
    // or implies that state, and only a paid purchase can be acknowledged.
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByUserId: text("acknowledged_by_user_id").references(() => user.id),
    // A PYUSD review (S16) is priced at one rate version of the shop and pins it with the rounded-up
    // atomic amount; a changed rate is a new checkout, never a changed review.
    pyusdRateVersionId: text("pyusd_rate_version_id").references((): AnyPgColumn => pyusdRates.id),
    pyusdAtomicAmount: bigint("pyusd_atomic_amount", { mode: "bigint" }),
    // The merchant's archive (S18): deleting an order on /merchant/orders only hides it. The state at
    // archive time lets an order archived before it was paid come back once paid. Set once; only the
    // operator's unarchive-order clears it (trigger in migration 0024).
    merchantArchivedAt: timestamp("merchant_archived_at", { withTimezone: true }),
    merchantArchivedByUserId: text("merchant_archived_by_user_id").references(() => user.id),
    merchantArchivedState: text("merchant_archived_state"),
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
    check("purchases_acknowledged_check", sql`(${t.acknowledgedAt} is null) = (${t.acknowledgedByUserId} is null)`),
    check(
      "purchases_merchant_archived_check",
      sql`((${t.merchantArchivedAt} is null) = (${t.merchantArchivedByUserId} is null)) and ((${t.merchantArchivedAt} is null) = (${t.merchantArchivedState} is null))`,
    ),
    check(
      "purchases_pyusd_price_check",
      sql`(${t.rail} = 'pyusd' and ${t.pyusdRateVersionId} is not null and ${t.pyusdAtomicAmount} > 0) or (${t.rail} is distinct from 'pyusd' and ${t.pyusdRateVersionId} is null and ${t.pyusdAtomicAmount} is null)`,
    ),
    index("purchases_buyer_idx").on(t.buyerUserId),
    index("purchases_outlet_created_idx").on(t.outletId, t.createdAt),
    index("purchases_basket_lock_key_idx").on(t.basketLockKey),
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

// PYUSD attempts (S16; Gate 3 "PYUSD attempt") share this table with rail 'pyusd': one per purchase,
// saved and locked before the unsigned transfer leaves the server, and never given the bytes.
export const PYUSD_ATTEMPT_STATES = ["prepared", "confirmed", "mismatch", "expired_scanning", "held_no_match", "closed_unpaid"] as const;

// One signature hint a buyer's browser posted, and what a finalized read decided about it.
export type StoredSignatureHint = { signature: string; receivedAt: string; decision: "unread" | "not_found" | "not_ours" | "failed_landing" | "confirmed" | "uncertain" };
// The mint's transfer-fee schedules read at preparation, as decimal strings.
export type StoredFeeEvidence = {
  preparedEpoch: string;
  older: { epoch: string; basisPoints: number; maximumFee: string };
  newer: { epoch: string; basisPoints: number; maximumFee: string };
};
// The post-expiry window scan of one attempt (S17; Gate 3 ScanCoverage), with block heights as
// decimal strings. Null until the attempt's finalized block height passes its bound.
export type StoredScanCoverage = {
  startedAtFinalizedHeight: string;
  newestSignature: string | null;
  beforeCursor: string | null;
  reachedBeforePreparation: boolean;
  pagesRead: number;
  candidatesChecked: number;
  lastGap: "rate_limited" | "null_transaction" | "rpc_unavailable" | "too_large" | "page_cap" | "identity_changed" | null;
  // Gate 3 reopening 2026-10-18; absent on coverage saved before it, which reads as null.
  pendingMismatch?: { signature: string; slot: string; destinationDelta: string | null; verification: string; foundAt: string } | null;
};

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchases.id),
    rail: text("rail").notNull().default("paypal"),
    state: text("state").notNull(),
    // Snapshot of what the order must carry, taken from the purchase and its destination. PayPal only.
    payeeMerchantId: text("payee_merchant_id"),
    totalSgdCents: integer("total_sgd_cents").notNull(),
    currency: text("currency").notNull(),
    createRequestId: text("create_request_id").unique(),
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
    // PYUSD evidence (S16), all fixed at preparation except the hints, the bound signature and its
    // verification time. The unsigned transaction bytes are never stored: only their fingerprint.
    pyusdBuyerWallet: text("pyusd_buyer_wallet"),
    pyusdSourceTokenAccount: text("pyusd_source_token_account"),
    pyusdDestinationTokenAccount: text("pyusd_destination_token_account"),
    pyusdAtomicAmount: bigint("pyusd_atomic_amount", { mode: "bigint" }),
    pyusdRateVersionId: text("pyusd_rate_version_id").references((): AnyPgColumn => pyusdRates.id),
    pyusdReference: text("pyusd_reference").unique(),
    pyusdMessageFingerprint: text("pyusd_message_fingerprint"),
    pyusdBlockhash: text("pyusd_blockhash"),
    pyusdLastValidBlockHeight: bigint("pyusd_last_valid_block_height", { mode: "bigint" }),
    pyusdPreparationSlot: bigint("pyusd_preparation_slot", { mode: "bigint" }),
    pyusdFee: jsonb("pyusd_fee").$type<StoredFeeEvidence>(),
    pyusdHints: jsonb("pyusd_hints").$type<StoredSignatureHint[]>().notNull().default(sql`'[]'::jsonb`),
    pyusdFinalizedSignature: text("pyusd_finalized_signature").unique(),
    pyusdVerifiedAt: timestamp("pyusd_verified_at", { withTimezone: true }),
    // Recovery (S17): the window scan's coverage, and the signature of the successful landing that
    // failed verification, so the scan never records that one as an extra transfer.
    pyusdScan: jsonb("pyusd_scan").$type<StoredScanCoverage>(),
    pyusdMismatchSignature: text("pyusd_mismatch_signature"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payment_attempts_rail_check", sql`${t.rail} in ('paypal', 'pyusd')`),
    check(
      "payment_attempts_state_check",
      sql`(${t.rail} = 'paypal' and ${t.state} in ('created', 'order_created', 'externally_approved', 'capture_dispatched', 'capture_confirmed', 'capture_failed', 'create_unknown', 'capture_unknown', 'abandoned')) or (${t.rail} = 'pyusd' and ${t.state} in ('prepared', 'confirmed', 'mismatch', 'expired_scanning', 'held_no_match', 'closed_unpaid'))`,
    ),
    check("payment_attempts_paypal_fields_check", sql`${t.rail} <> 'paypal' or (${t.payeeMerchantId} is not null and ${t.createRequestId} is not null)`),
    check(
      "payment_attempts_pyusd_fields_check",
      sql`${t.rail} <> 'pyusd' or (${t.payeeMerchantId} is null and ${t.createRequestId} is null and ${t.pyusdBuyerWallet} is not null and ${t.pyusdSourceTokenAccount} is not null and ${t.pyusdDestinationTokenAccount} is not null and ${t.pyusdAtomicAmount} > 0 and ${t.pyusdRateVersionId} is not null and ${t.pyusdReference} is not null and ${t.pyusdMessageFingerprint} is not null and ${t.pyusdBlockhash} is not null and ${t.pyusdLastValidBlockHeight} is not null and ${t.pyusdPreparationSlot} is not null and ${t.pyusdFee} is not null)`,
    ),
    check("payment_attempts_pyusd_confirmed_check", sql`${t.state} <> 'confirmed' or (${t.pyusdFinalizedSignature} is not null and ${t.pyusdVerifiedAt} is not null)`),
    // A mismatch names the landing that failed verification (S17).
    check("payment_attempts_pyusd_mismatch_check", sql`${t.state} <> 'mismatch' or ${t.pyusdMismatchSignature} is not null`),
    check("payment_attempts_pyusd_hints_check", sql`jsonb_typeof(${t.pyusdHints}) = 'array' and jsonb_array_length(${t.pyusdHints}) <= 3`),
    // One PYUSD attempt per purchase, ever: its bytes are released once, and a lost response leaves
    // the attempt locked until recovery, never a second preparation.
    uniqueIndex("payment_attempts_one_pyusd").on(t.purchaseId).where(sql`${t.rail} = 'pyusd'`),
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

export const RATE_LIMIT_BUCKETS = ["buyer_suggestion", "wallet_challenge"] as const;

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: text("id").primaryKey(),
    bucket: text("bucket").notNull(),
    subject: text("subject").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("rate_limit_hits_bucket_check", sql`${t.bucket} in ('buyer_suggestion', 'wallet_challenge')`),
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

// Menu photo import attempts (S11; Gate 3 "Menu and imports", MenuImportRow). One row per admitted
// attempt, written by admission and closed once. It holds counts, usage, timings and a fingerprint
// of the validated result, never an image byte, image hash, URL or file name. Expiry is derived on
// read from deadline_at; nothing ever writes "expired".
export const menuImports = pgTable(
  "menu_imports",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    baseRevisionId: text("base_revision_id")
      .notNull()
      .references(() => menuRevisions.id),
    consentVersion: text("consent_version").notNull(),
    // Digest of the model, its reviewed bounds, the prompt version and the schema version.
    modelConfigVersion: text("model_config_version").notNull(),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    // Committed before the vision call; a row without it never reached OpenAI.
    modelDispatchedAt: timestamp("model_dispatched_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedOutcome: text("closed_outcome"),
    reservedUsdMicros: bigint("reserved_usd_micros", { mode: "number" }).notNull(),
    actualUsdMicros: bigint("actual_usd_micros", { mode: "number" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    rowsDrafted: integer("rows_drafted"),
    rowsBlankPrice: integer("rows_blank_price"),
    // SHA-256 of the validated result, never of the image.
    resultFingerprint: text("result_fingerprint"),
    latencyMs: integer("latency_ms"),
    peakRssBytes: bigint("peak_rss_bytes", { mode: "number" }),
    // S24: what the import read. A web import keeps only the link's host, never the full URL.
    source: text("source").notNull().default("photo"),
    sourceHost: text("source_host"),
  },
  (t) => [
    check(
      "menu_imports_outcome_check",
      sql`${t.closedOutcome} is null or ${t.closedOutcome} in ('completed', 'conflict_base_revision', 'conflict_confirmed', 'membership_revoked', 'rejected_upload', 'rejected_photo', 'model_failed', 'model_timeout', 'output_invalid', 'aborted', 'page_refused', 'page_timeout', 'page_unreachable', 'picture_menu')`,
    ),
    check("menu_imports_source_check", sql`${t.source} in ('photo', 'web_page') and (${t.sourceHost} is null or length(${t.sourceHost}) <= 253)`),
    check("menu_imports_closed_check", sql`(${t.closedAt} is null) = (${t.closedOutcome} is null)`),
    check("menu_imports_reserved_check", sql`${t.reservedUsdMicros} >= 0`),
    check("menu_imports_deadline_check", sql`${t.deadlineAt} > ${t.admittedAt}`),
    index("menu_imports_outlet_admitted_idx").on(t.outletId, t.admittedAt),
    index("menu_imports_admitted_idx").on(t.admittedAt),
  ],
);

// The singleton row every import admission locks first (S11), so the in-flight limits, daily caps
// and the spend ceiling are checked against one consistent view.
export const menuImportAdmission = pgTable(
  "menu_import_admission",
  {
    id: text("id").primaryKey(),
    lastAdmittedAt: timestamp("last_admitted_at", { withTimezone: true }),
  },
  (t) => [check("menu_import_admission_singleton_check", sql`${t.id} = 'global'`)],
);

// PYUSD rates (S16; Gate 2 "Identity, destination and rate"). Append-only: each set or re-confirmation
// of a shop's rate is a new immutable version, the newest one is the shop's rate, and its age is
// computed on read. atomic_per_sgd is PYUSD atomic units (10^-6 PYUSD) per S$1.
export const pyusdRates = pgTable(
  "pyusd_rates",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    atomicPerSgd: bigint("atomic_per_sgd", { mode: "bigint" }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    confirmedByUserId: text("confirmed_by_user_id")
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    check("pyusd_rates_bounds_check", sql`${t.atomicPerSgd} between 1 and 10000000`),
    index("pyusd_rates_outlet_confirmed_idx").on(t.outletId, t.confirmedAt),
  ],
);

// Extra transfers (S17; Gate 2 fix M; Gate 3 ExtraTransfer): every other successful landing that
// carries an attempt's reference, found by its window scan. A row never changes the attempt, the
// purchase or the bound evidence. The refund reference is recorded out of band by the operator act
// record-extra-transfer-refund, with migration credentials: neither the web nor the maintenance role
// may write it, and recording it changes no payment state.
export const PYUSD_EXTRA_VERIFICATIONS = [
  "verified",
  "metadata_incomplete",
  "account_keys_unresolved",
  "blockhash_mismatch",
  "extra_signer",
  "fee_payer_mismatch",
  "transfer_count",
  "mint_mismatch",
  "decimals_mismatch",
  "source_mismatch",
  "destination_mismatch",
  "amount_mismatch",
  "memo_count",
  "fee_nonzero_at_execution",
  "balance_delta_mismatch",
  "outer_instruction_not_allowlisted",
  "lighthouse_not_assertion",
  "inner_program_not_allowlisted",
  "inner_instruction_not_allowlisted",
] as const;

export const pyusdExtraTransfers = pgTable(
  "pyusd_extra_transfers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => paymentAttempts.id),
    signature: text("signature").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    // The destination's balance change in the transaction's own metadata; null when incomplete.
    destinationDelta: bigint("destination_delta", { mode: "bigint" }),
    verification: text("verification").notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull(),
    refundReference: text("refund_reference"),
    refundRecordedAt: timestamp("refund_recorded_at", { withTimezone: true }),
    refundRecordedByUserId: text("refund_recorded_by_user_id").references(() => user.id),
  },
  (t) => [
    // A resumed scan cannot record one landing twice.
    uniqueIndex("pyusd_extra_transfers_attempt_signature_unique").on(t.attemptId, t.signature),
    check("pyusd_extra_transfers_verification_check", sql`${t.verification} in (${sql.raw(PYUSD_EXTRA_VERIFICATIONS.map((v) => `'${v}'`).join(", "))})`),
    check(
      "pyusd_extra_transfers_refund_check",
      sql`(${t.refundReference} is null and ${t.refundRecordedAt} is null and ${t.refundRecordedByUserId} is null) or (length(btrim(${t.refundReference})) > 0 and ${t.refundRecordedAt} is not null and ${t.refundRecordedByUserId} is not null)`,
    ),
  ],
);

// Wallet challenges (S16). The exact UTF-8 bytes the merchant's wallet signs are saved verbatim; the
// proof verifies the signature against these bytes and the saved wallet, never against request
// input, and consumes the challenge once, in the transaction that records the destination.
export const walletChallenges = pgTable(
  "wallet_challenges",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    memberUserId: text("member_user_id")
      .notNull()
      .references(() => user.id),
    wallet: text("wallet").notNull(),
    // The exact UTF-8 bytes the wallet signs, saved verbatim (Gate 3 WalletChallenge.message).
    message: bytea("message").notNull(),
    nonceHash: text("nonce_hash").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [check("wallet_challenges_expiry_check", sql`${t.expiresAt} > ${t.issuedAt}`), index("wallet_challenges_outlet_idx").on(t.outletId, t.issuedAt)],
);

// The shared Solana RPC limiter (S16; Gate 3 RPC_BUDGET), shared by the web app and, from S17, the
// runner. One row per admitted call, pruned on admission; two concurrency slot rows held by lease;
// and one backoff row that a 429 sets for every caller.
export const rpcLimiterCalls = pgTable(
  "rpc_limiter_calls",
  {
    id: text("id").primaryKey(),
    method: text("method").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rpc_limiter_calls_at_idx").on(t.at), index("rpc_limiter_calls_method_at_idx").on(t.method, t.at)],
);

export const rpcLimiterSlots = pgTable(
  "rpc_limiter_slots",
  {
    slot: integer("slot").primaryKey(),
    holder: text("holder"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  },
  (t) => [check("rpc_limiter_slots_range_check", sql`${t.slot} in (0, 1)`), check("rpc_limiter_slots_lease_check", sql`(${t.holder} is null) = (${t.leaseExpiresAt} is null)`)],
);

export const rpcLimiterBackoff = pgTable(
  "rpc_limiter_backoff",
  {
    id: text("id").primaryKey(),
    until: timestamp("until", { withTimezone: true }),
    consecutive: integer("consecutive").notNull().default(0),
  },
  (t) => [check("rpc_limiter_backoff_singleton_check", sql`${t.id} = 'global'`)],
);
