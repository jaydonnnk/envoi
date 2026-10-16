import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { recordAudit } from "@/domain/audit/events";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import * as schema from "@/lib/db/schema";
import { pgConnection } from "@/lib/db/web";
import { isEntrypoint } from "@/lib/entrypoint";
import { hashToken, newId, newSecretToken } from "@/lib/ids";
import { redact } from "@/lib/log";

// Operator acts (Gate 4 delta D1), run locally by the human operator with MIGRATION_DATABASE_URL.
// No HTTP route reaches this file.

type OperatorDb = PostgresJsDatabase<typeof schema>;

export const DEMO_FIXTURE_KEY = "demo-fixture-1";

// Fictional branding (product rule 9). Every price is known, so the tracer basket can be priced.
export const DEMO_FIXTURE = {
  name: "Lorong Demo Kopi",
  area: "Tanjong Pagar",
  items: [
    { name: "Kopi O", unitSgdCents: 160 },
    { name: "Kaya toast set", unitSgdCents: 450 },
    { name: "Teh C peng", unitSgdCents: 220 },
    { name: "Soft-boiled eggs (2)", unitSgdCents: 200 },
  ],
} as const;

export type SeedResult = { status: "created" | "unchanged"; outletId: string; menuRevisionId: string };

// Creates the fixture only when it is absent. Run again, it changes nothing and reports the
// existing ids, so no operator act ever gives a basket a second checkout key.
export async function seedDemoFixture(db: OperatorDb, now: Date = new Date()): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const outletId = newId("out");
    const inserted = await tx
      .insert(schema.outlets)
      .values({ id: outletId, name: DEMO_FIXTURE.name, area: DEMO_FIXTURE.area, isDemoFixture: true, fixtureKey: DEMO_FIXTURE_KEY, createdAt: now })
      .onConflictDoNothing({ target: schema.outlets.fixtureKey })
      .returning({ id: schema.outlets.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: schema.outlets.id, menuRevisionId: schema.outlets.publishedMenuRevisionId })
        .from(schema.outlets)
        .where(eq(schema.outlets.fixtureKey, DEMO_FIXTURE_KEY));
      if (!existing?.menuRevisionId) throw new Error("The demo fixture exists without a published menu; inspect it by hand.");
      return { status: "unchanged", outletId: existing.id, menuRevisionId: existing.menuRevisionId };
    }

    const menuRevisionId = newId("mrv");
    await tx.insert(schema.menuRevisions).values({ id: menuRevisionId, outletId, status: "confirmed", confirmedAt: now, createdAt: now });
    await tx.insert(schema.menuItems).values(
      DEMO_FIXTURE.items.map((item, position) => {
        const id = newId("itm");
        return { id, itemKey: id, menuRevisionId, position, name: item.name, unitSgdCents: item.unitSgdCents, available: true };
      }),
    );
    await tx.update(schema.outlets).set({ publishedMenuRevisionId: menuRevisionId }).where(eq(schema.outlets.id, outletId));
    return { status: "created", outletId, menuRevisionId };
  });
}

// PayPal account ids: 13 characters from 2-9 and A-Z without I and O (PayPal rejects any other
// payee merchant_id with INVALID_PARAMETER_SYNTAX).
const PAYPAL_MERCHANT_ID = /^[2-9A-HJ-NP-Z]{13}$/;

export type AssignResult = { status: "created" | "unchanged"; outletId: string; destinationId: string; sellerMerchantId: string; version: number };

// Writes a PayPal sandbox destination only for an outlet that has none (D1). Run again, for the
// same or another seller, it changes nothing and reports the existing destination, so no operator
// act gives a basket a second checkout key. The seller is a distinct sandbox account, never
// Envoi's own API caller account.
export async function assignPayPalDestination(db: OperatorDb, outletId: string, sellerMerchantId: string, now: Date = new Date()): Promise<AssignResult> {
  if (!PAYPAL_MERCHANT_ID.test(sellerMerchantId)) throw new Error("The seller id must be a PayPal sandbox account id: 13 characters, 2-9 and A-Z without I or O.");
  return db.transaction(async (tx) => {
    const [outlet] = await tx.select({ id: schema.outlets.id }).from(schema.outlets).where(eq(schema.outlets.id, outletId));
    if (!outlet) throw new Error(`No outlet ${outletId}.`);
    const destinationId = newId("dst");
    const inserted = await tx
      .insert(schema.paymentDestinations)
      .values({ id: destinationId, outletId, rail: "paypal", environment: "sandbox", sellerMerchantId, status: "active", version: 1, createdAt: now })
      .onConflictDoNothing({ target: [schema.paymentDestinations.outletId, schema.paymentDestinations.rail] })
      .returning({ id: schema.paymentDestinations.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select()
        .from(schema.paymentDestinations)
        .where(and(eq(schema.paymentDestinations.outletId, outletId), eq(schema.paymentDestinations.rail, "paypal")));
      if (!existing) throw new Error("Destination conflict without a destination; inspect it by hand.");
      return { status: "unchanged", outletId, destinationId: existing.id, sellerMerchantId: existing.sellerMerchantId, version: existing.version };
    }
    await recordAudit(tx, {
      at: now,
      actor: "operator",
      action: "paypal_destination_assigned",
      outletId,
      operatorVisible: true,
      details: { destinationId, sellerMerchantId, environment: "sandbox" },
    });
    return { status: "created", outletId, destinationId, sellerMerchantId, version: 1 };
  });
}

export const AGENT_TOKEN_PREFIX = "envoi_agent_";

export type IssuedAgentToken = { agentTokenId: string; label: string; token: string };

// Issues a scoped demo token for one supported MCP client (Gate 2; S13). The token is returned once
// for the operator to copy into the client; only its SHA-256 digest is stored, so it cannot be shown
// again. Its scope is fixed in code to search_outlets, get_menu and create_purchase_request.
export async function issueAgentToken(db: OperatorDb, label: string, now: Date = new Date()): Promise<IssuedAgentToken> {
  const trimmed = label.trim();
  if (!/^[A-Za-z0-9 ._-]{1,64}$/.test(trimmed)) throw new Error("The label must be 1 to 64 letters, digits, spaces, dots, dashes or underscores.");
  const token = `${AGENT_TOKEN_PREFIX}${newSecretToken()}`;
  const agentTokenId = newId("agt");
  await db.transaction(async (tx) => {
    await tx.insert(schema.agentTokens).values({ id: agentTokenId, label: trimmed, tokenHash: hashToken(token), createdAt: now });
    await recordAudit(tx, { at: now, actor: "operator", action: "agent_token_issued", operatorVisible: true, details: { agentTokenId, label: trimmed } });
  });
  return { agentTokenId, label: trimmed, token };
}

// Merchant accounts (S6). Public signup is off, so this is the only way a permanent account comes
// into being. The password is typed by the operator at a hidden prompt and passed here in memory;
// only Better Auth's scrypt hash is stored, and the password is never printed, logged or written.

export const PASSWORD_LENGTH = { min: 12, max: 128 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MerchantAccountResult = { status: "created" | "unchanged"; userId: string };

// Creates the account only when no account has this email. Run again, it changes nothing, and in
// particular never resets the existing password. The account holds no membership until
// approve-membership grants one.
export async function createMerchant(db: OperatorDb, input: { email: string; name: string; password: string }, now: Date = new Date()): Promise<MerchantAccountResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL.test(email) || email.length > 254) throw new Error("The email must look like name@example.com.");
  if (name.length < 1 || name.length > 64) throw new Error("The name must be 1 to 64 characters.");
  if (input.password.length < PASSWORD_LENGTH.min || input.password.length > PASSWORD_LENGTH.max) {
    throw new Error(`The password must be ${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters.`);
  }
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const userId = newId("usr");
    const inserted = await tx
      .insert(schema.user)
      .values({ id: userId, name, email, emailVerified: false, isAnonymous: false, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: schema.user.email })
      .returning({ id: schema.user.id });
    if (inserted.length === 0) {
      const [existing] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
      if (!existing) throw new Error("Account conflict without an account; inspect it by hand.");
      return { status: "unchanged", userId: existing.id };
    }
    await tx.insert(schema.account).values({ id: newId("acc"), accountId: userId, providerId: "credential", userId, password: hash, createdAt: now, updatedAt: now });
    await recordAudit(tx, { at: now, actor: "operator", action: "merchant_account_created", operatorVisible: true, details: { userId } });
    return { status: "created", userId };
  });
}

export type MembershipResult = { status: "created" | "unchanged"; userId: string; membershipId: string };

// Approves one unbound membership for a permanent account: the merchant's next outlet creation
// binds it to that outlet. An account that already holds an unbound membership keeps it and
// nothing changes. An anonymous or unknown account is refused.
export async function approveMembership(db: OperatorDb, input: { email: string; evidenceRef?: string | null }, now: Date = new Date()): Promise<MembershipResult> {
  const email = input.email.trim().toLowerCase();
  const evidenceRef = input.evidenceRef?.trim() || null;
  if (evidenceRef !== null && evidenceRef.length > 200) throw new Error("The evidence reference must be at most 200 characters.");
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: schema.user.id, isAnonymous: schema.user.isAnonymous })
      .from(schema.user)
      .innerJoin(schema.account, and(eq(schema.account.userId, schema.user.id), eq(schema.account.providerId, "credential")))
      .where(eq(schema.user.email, email))
      .limit(1);
    if (!account || account.isAnonymous) throw new Error(`No merchant account ${email}; create it with create-merchant first.`);
    const membershipId = newId("mbr");
    const inserted = await tx
      .insert(schema.merchantMemberships)
      .values({ id: membershipId, userId: account.id, role: "owner", isDemo: true, evidenceRef, approvedAt: now, createdAt: now })
      .onConflictDoNothing({ target: schema.merchantMemberships.userId, where: sql`${schema.merchantMemberships.outletId} is null and ${schema.merchantMemberships.revokedAt} is null` })
      .returning({ id: schema.merchantMemberships.id });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: schema.merchantMemberships.id })
        .from(schema.merchantMemberships)
        .where(and(eq(schema.merchantMemberships.userId, account.id), isNull(schema.merchantMemberships.outletId), isNull(schema.merchantMemberships.revokedAt)));
      if (!existing) throw new Error("Membership conflict without a membership; inspect it by hand.");
      return { status: "unchanged", userId: account.id, membershipId: existing.id };
    }
    await recordAudit(tx, {
      at: now,
      actor: "operator",
      action: "membership_approved",
      operatorVisible: true,
      details: { membershipId, userId: account.id, hasEvidence: evidenceRef !== null },
    });
    return { status: "created", userId: account.id, membershipId };
  });
}

export type EnrollmentResult = { status: "approved" | "unchanged"; outletId: string; enrollmentId: string };

// Approves an outlet's pending enrollment (S7): the operator recorded the demo authority out of
// band. Only this act approves one; the web role cannot write the status. An approved enrollment
// stays approved and nothing changes. An outlet without an enrollment is refused.
export async function approveEnrollment(db: OperatorDb, input: { outletId: string; evidenceRef?: string | null }, now: Date = new Date()): Promise<EnrollmentResult> {
  const evidenceRef = input.evidenceRef?.trim() || null;
  if (evidenceRef !== null && evidenceRef.length > 200) throw new Error("The evidence reference must be at most 200 characters.");
  return db.transaction(async (tx) => {
    const [enrollment] = await tx
      .select({ id: schema.enrollments.id, status: schema.enrollments.status })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.outletId, input.outletId))
      .for("update");
    if (!enrollment) throw new Error(`Outlet ${input.outletId} has no enrollment; only a merchant-created outlet has one.`);
    if (enrollment.status === "approved") return { status: "unchanged", outletId: input.outletId, enrollmentId: enrollment.id };
    await tx.update(schema.enrollments).set({ status: "approved", approvedAt: now, evidenceRef }).where(eq(schema.enrollments.id, enrollment.id));
    await recordAudit(tx, {
      at: now,
      actor: "operator",
      action: "enrollment_approved",
      outletId: input.outletId,
      operatorVisible: true,
      details: { enrollmentId: enrollment.id, hasEvidence: evidenceRef !== null },
    });
    return { status: "approved", outletId: input.outletId, enrollmentId: enrollment.id };
  });
}

export type PendingIdentifier = {
  identifierId: string;
  outletId: string;
  outletName: string;
  identifier: string;
  distinguisher: string;
  source: string;
  checksumValid: boolean | null;
};

// The mappings merchants submitted that the operator has not approved (S9), oldest first, so the
// operator can compare each with the evidence before approving it.
export async function pendingIdentifiers(db: OperatorDb): Promise<PendingIdentifier[]> {
  return db
    .select({
      identifierId: schema.outletIdentifiers.id,
      outletId: schema.outletIdentifiers.outletId,
      outletName: schema.outlets.name,
      identifier: schema.outletIdentifiers.identifier,
      distinguisher: schema.outletIdentifiers.distinguisher,
      source: schema.outletIdentifiers.source,
      checksumValid: schema.outletIdentifiers.checksumValid,
    })
    .from(schema.outletIdentifiers)
    .innerJoin(schema.outlets, eq(schema.outlets.id, schema.outletIdentifiers.outletId))
    .where(isNull(schema.outletIdentifiers.approvedAt))
    .orderBy(schema.outletIdentifiers.submittedAt, schema.outletIdentifiers.id);
}

export type IdentifierResult = { status: "approved" | "unchanged"; identifierId: string; outletId: string };

// Approves one submitted identifier mapping (S9): the operator checked out of band that this
// business identifier belongs to this outlet. Only this act approves one; the web role can neither
// insert nor update approved_at. An approved mapping stays approved and nothing changes.
export async function approveIdentifier(db: OperatorDb, input: { identifierId: string; evidenceRef?: string | null }, now: Date = new Date()): Promise<IdentifierResult> {
  const evidenceRef = input.evidenceRef?.trim() || null;
  if (evidenceRef !== null && evidenceRef.length > 200) throw new Error("The evidence reference must be at most 200 characters.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: schema.outletIdentifiers.id, outletId: schema.outletIdentifiers.outletId, approvedAt: schema.outletIdentifiers.approvedAt })
      .from(schema.outletIdentifiers)
      .where(eq(schema.outletIdentifiers.id, input.identifierId))
      .for("update");
    if (!row) throw new Error(`No submitted identifier ${input.identifierId}; run approve-identifier with no arguments to list the pending ones.`);
    if (row.approvedAt !== null) return { status: "unchanged", identifierId: row.id, outletId: row.outletId };
    await tx.update(schema.outletIdentifiers).set({ approvedAt: now, evidenceRef }).where(eq(schema.outletIdentifiers.id, row.id));
    await recordAudit(tx, {
      at: now,
      actor: "operator",
      action: "identifier_approved",
      outletId: row.outletId,
      operatorVisible: true,
      details: { identifierId: row.id, hasEvidence: evidenceRef !== null },
    });
    return { status: "approved", identifierId: row.id, outletId: row.outletId };
  });
}

export type OperatorGrantResult = { status: "created" | "unchanged"; userId: string; grantId: string };

// Flags a permanent account made with create-merchant as the operator (S5). The operator health
// view and the S17 operator acts check this row. An anonymous or unknown account is refused, and an
// account already flagged keeps its grant and nothing changes.
export async function grantOperator(db: OperatorDb, input: { email: string; evidenceRef?: string | null }, now: Date = new Date()): Promise<OperatorGrantResult> {
  const email = input.email.trim().toLowerCase();
  const evidenceRef = input.evidenceRef?.trim() || null;
  if (evidenceRef !== null && evidenceRef.length > 200) throw new Error("The evidence reference must be at most 200 characters.");
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: schema.user.id, isAnonymous: schema.user.isAnonymous })
      .from(schema.user)
      .innerJoin(schema.account, and(eq(schema.account.userId, schema.user.id), eq(schema.account.providerId, "credential")))
      .where(eq(schema.user.email, email))
      .limit(1);
    if (!account || account.isAnonymous) throw new Error(`No permanent account ${email}; create it with create-merchant first.`);
    const grantId = newId("opg");
    const inserted = await tx
      .insert(schema.operatorGrants)
      .values({ id: grantId, userId: account.id, evidenceRef, grantedAt: now })
      .onConflictDoNothing({ target: schema.operatorGrants.userId, where: sql`${schema.operatorGrants.revokedAt} is null` })
      .returning({ id: schema.operatorGrants.id });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: schema.operatorGrants.id })
        .from(schema.operatorGrants)
        .where(and(eq(schema.operatorGrants.userId, account.id), isNull(schema.operatorGrants.revokedAt)));
      if (!existing) throw new Error("Operator grant conflict without a grant; inspect it by hand.");
      return { status: "unchanged", userId: account.id, grantId: existing.id };
    }
    await recordAudit(tx, { at: now, actor: "operator", action: "operator_granted", operatorVisible: true, details: { grantId, userId: account.id, hasEvidence: evidenceRef !== null } });
    return { status: "created", userId: account.id, grantId };
  });
}

// Reads one line from the terminal without echoing it. Refuses when stdin is not a terminal, so a
// password is never piped in from a file or a shell history.
function promptHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) return Promise.reject(new Error("create-merchant reads the password from a terminal; run it interactively."));
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("cancelled"));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.resume();
  });
}

const COMMANDS = ["seed-demo-fixture", "assign-paypal-destination", "issue-agent-token", "create-merchant", "approve-membership", "approve-enrollment", "approve-identifier", "grant-operator"];

const USAGE =
  "usage: npm run operator -- seed-demo-fixture | assign-paypal-destination <outletId> <sellerMerchantId> | issue-agent-token <label> | create-merchant <email> <name> | approve-membership <email> [evidenceRef] | approve-enrollment <outletId> [evidenceRef] | approve-identifier [identifierId [evidenceRef]] | grant-operator <email> [evidenceRef]";

async function run(db: OperatorDb, argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === "seed-demo-fixture" && args.length === 0) {
    const result = await seedDemoFixture(db);
    console.log(
      result.status === "created"
        ? `created demo fixture: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`
        : `demo fixture already exists, nothing changed: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`,
    );
    return 0;
  }
  if (command === "assign-paypal-destination" && args.length === 2) {
    const result = await assignPayPalDestination(db, args[0]!, args[1]!);
    console.log(
      result.status === "created"
        ? `assigned PayPal sandbox destination ${result.destinationId} (seller ${result.sellerMerchantId}, version ${result.version}) to outlet ${result.outletId}`
        : `outlet ${result.outletId} already has PayPal destination ${result.destinationId} (seller ${result.sellerMerchantId}, version ${result.version}); nothing changed`,
    );
    return 0;
  }
  if (command === "issue-agent-token" && args.length === 1) {
    const issued = await issueAgentToken(db, args[0]!);
    console.log(`issued agent token ${issued.agentTokenId} for "${issued.label}". Copy it into the MCP client now; Envoi keeps only its digest and cannot show it again:`);
    console.log(issued.token);
    return 0;
  }
  if (command === "create-merchant" && args.length === 2) {
    const password = await promptHidden(`Password for ${args[0]} (${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters, not shown): `);
    if ((await promptHidden("Type it again: ")) !== password) throw new Error("The two passwords differ; nothing was created.");
    const result = await createMerchant(db, { email: args[0]!, name: args[1]!, password });
    console.log(
      result.status === "created"
        ? `created merchant account ${result.userId}. It holds no membership yet: run approve-membership ${args[0]}`
        : `an account with that email already exists (${result.userId}); nothing changed and its password was not touched`,
    );
    return 0;
  }
  if (command === "approve-membership" && (args.length === 1 || args.length === 2)) {
    const result = await approveMembership(db, { email: args[0]!, evidenceRef: args[1] ?? null });
    console.log(
      result.status === "created"
        ? `approved membership ${result.membershipId} for account ${result.userId}; its next shop creation binds it`
        : `account ${result.userId} already holds unbound membership ${result.membershipId}; nothing changed`,
    );
    return 0;
  }
  if (command === "approve-enrollment" && (args.length === 1 || args.length === 2)) {
    const result = await approveEnrollment(db, { outletId: args[0]!, evidenceRef: args[1] ?? null });
    console.log(
      result.status === "approved"
        ? `approved enrollment ${result.enrollmentId} of outlet ${result.outletId}; its merchant can publish once the other checks hold`
        : `enrollment ${result.enrollmentId} of outlet ${result.outletId} is already approved; nothing changed`,
    );
    return 0;
  }
  if (command === "approve-identifier" && args.length === 0) {
    const pending = await pendingIdentifiers(db);
    if (pending.length === 0) console.log("no identifier mapping is waiting for approval");
    for (const row of pending) {
      const checksum = row.checksumValid === null ? "no sticker" : row.checksumValid ? "checksum valid" : "checksum INVALID";
      console.log(`${row.identifierId}  outlet ${row.outletId} (${row.outletName})  UEN ${row.identifier}  "${row.distinguisher}"  ${row.source}, ${checksum}`);
    }
    return 0;
  }
  if (command === "approve-identifier" && (args.length === 1 || args.length === 2)) {
    const result = await approveIdentifier(db, { identifierId: args[0]!, evidenceRef: args[1] ?? null });
    console.log(
      result.status === "approved"
        ? `approved identifier mapping ${result.identifierId} for outlet ${result.outletId}`
        : `identifier mapping ${result.identifierId} for outlet ${result.outletId} is already approved; nothing changed`,
    );
    return 0;
  }
  if (command === "grant-operator" && (args.length === 1 || args.length === 2)) {
    const result = await grantOperator(db, { email: args[0]!, evidenceRef: args[1] ?? null });
    console.log(
      result.status === "created"
        ? `flagged account ${result.userId} as the operator (grant ${result.grantId}); it can now open /operator/health after signing in`
        : `account ${result.userId} is already the operator (grant ${result.grantId}); nothing changed`,
    );
    return 0;
  }
  console.error(USAGE);
  return 2;
}

async function main(argv: string[]): Promise<number> {
  if (!COMMANDS.includes(argv[0] ?? "")) {
    console.error(USAGE);
    return 2;
  }
  loadLocalEnvFile();
  const connection = pgConnection(migrationEnv().MIGRATION_DATABASE_URL);
  const client = postgres(connection.url, { ssl: connection.ssl, max: 1, onnotice: () => {}, connection: { search_path: "public" } });
  try {
    return await run(drizzle(client, { schema }), argv);
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error("operator command failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    });
}
