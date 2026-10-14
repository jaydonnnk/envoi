import { and, eq, isNull } from "drizzle-orm";
import { appError, type AppError } from "@/lib/errors";
import type { Auth } from "@/lib/auth";
import { agentTokens, merchantMemberships, operatorGrants } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { hashToken } from "@/lib/ids";

// Principal guards. Every route begins with exactly one require* guard from this file.

export type BuyerPrincipal = { kind: "buyer"; userId: string; isAnonymous: boolean };

// An external agent holding an out-of-band scoped demo token (Gate 3 Authorization). It may use only
// search_outlets, get_menu and create_purchase_request; it is never a buyer.
export type AgentPrincipal = { kind: "agent"; agentTokenId: string; label: string };

// A signed-in account holding at least one live, operator-approved membership row (S6). Every
// merchant grant comes from those rows, never from a property of the user record.
export type MerchantAccountPrincipal = { kind: "merchant_account"; userId: string };

// A merchant acting on one outlet: the live membership row for this user and this outlet.
export type OutletMemberPrincipal = { kind: "outlet_member"; userId: string; outletId: string; membershipId: string };

function bearerOf(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (value === null) return null;
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(value);
  return match ? match[1]! : "";
}

export async function requireBuyerSession(auth: Auth, headers: Headers): Promise<BuyerPrincipal | AppError> {
  // A request that presents an agent credential is never a buyer, whatever cookie it carries: an
  // agent cannot redeem a handoff, pay or read a receipt.
  if (headers.has("authorization")) {
    return appError("forbidden_membership", "Agent tokens cannot use buyer routes.", { details: { reason: "agent_token" } });
  }
  const result = await auth.api.getSession({ headers });
  if (!result) return appError("unauthorized", "A buyer session is required.");
  return { kind: "buyer", userId: result.user.id, isAnonymous: result.user.isAnonymous === true };
}

export function isPrincipal(value: BuyerPrincipal | AppError): value is BuyerPrincipal {
  return "kind" in value && value.kind === "buyer";
}

// Only a live token's digest is looked up; the token itself is never stored or logged.
export async function requireAgentToken(db: Db, headers: Headers): Promise<AgentPrincipal | AppError> {
  const token = bearerOf(headers);
  if (!token) return appError("unauthorized", "An agent token is required.");
  const [row] = await db
    .select({ id: agentTokens.id, label: agentTokens.label })
    .from(agentTokens)
    .where(and(eq(agentTokens.tokenHash, hashToken(token)), isNull(agentTokens.revokedAt)))
    .limit(1);
  if (!row) return appError("unauthorized", "An agent token is required.");
  return { kind: "agent", agentTokenId: row.id, label: row.label };
}

export function isAgent(value: AgentPrincipal | AppError): value is AgentPrincipal {
  return "kind" in value && value.kind === "agent";
}

// Merchant routes refuse an agent credential, an anonymous session and any session without a
// matching membership row with 403 forbidden_membership. Gate 2 requires a non-anonymous user on
// every merchant action, so an anonymous session is refused here before any membership row is read,
// even one that no supported path would have created.
async function merchantSession(auth: Auth, headers: Headers): Promise<{ userId: string } | AppError> {
  if (headers.has("authorization")) {
    return appError("forbidden_membership", "Agent tokens cannot use merchant routes.", { details: { reason: "agent_token" } });
  }
  const result = await auth.api.getSession({ headers });
  if (!result) return appError("unauthorized", "Sign in with your merchant account.");
  if (result.user.isAnonymous === true) {
    return appError("forbidden_membership", "Sign in with your merchant account.", { details: { reason: "anonymous_session" } });
  }
  return { userId: result.user.id };
}

const noMembership = () => appError("forbidden_membership", "This account has no approved membership for that shop.");

export async function requireMerchantMembership(auth: Auth, db: Db, headers: Headers): Promise<MerchantAccountPrincipal | AppError> {
  const session = await merchantSession(auth, headers);
  if ("code" in session) return session;
  const [row] = await db
    .select({ id: merchantMemberships.id })
    .from(merchantMemberships)
    .where(and(eq(merchantMemberships.userId, session.userId), isNull(merchantMemberships.revokedAt)))
    .limit(1);
  if (!row) return noMembership();
  return { kind: "merchant_account", userId: session.userId };
}

export function isMerchantAccount(value: MerchantAccountPrincipal | AppError): value is MerchantAccountPrincipal {
  return "kind" in value && value.kind === "merchant_account";
}

// Reads the live membership row for this user and this outlet (Gate 3 Authorization). A member of
// one outlet is refused on every other outlet.
export async function requireOutletMembership(auth: Auth, db: Db, headers: Headers, outletId: string): Promise<OutletMemberPrincipal | AppError> {
  const session = await merchantSession(auth, headers);
  if ("code" in session) return session;
  const [row] = await db
    .select({ id: merchantMemberships.id })
    .from(merchantMemberships)
    .where(and(eq(merchantMemberships.userId, session.userId), eq(merchantMemberships.outletId, outletId), isNull(merchantMemberships.revokedAt)))
    .limit(1);
  if (!row) return noMembership();
  return { kind: "outlet_member", userId: session.userId, outletId, membershipId: row.id };
}

export function isOutletMember(value: OutletMemberPrincipal | AppError): value is OutletMemberPrincipal {
  return "kind" in value && value.kind === "outlet_member";
}

// The operator (S5): a permanent account holding a live operator_grants row, which only the
// operator CLI's grant-operator writes. Gate 3's error codes have no operator code, so every other
// caller, whether an agent credential, no session, an anonymous buyer or a signed-in account without
// a grant, gets the same 404 not_found and learns nothing about the route.
export type OperatorPrincipal = { kind: "operator"; userId: string };

const operatorNotFound = () => appError("not_found", "Not found.");

export async function requireOperator(auth: Auth, db: Db, headers: Headers): Promise<OperatorPrincipal | AppError> {
  if (headers.has("authorization")) return operatorNotFound();
  const result = await auth.api.getSession({ headers });
  if (!result || result.user.isAnonymous === true) return operatorNotFound();
  const [grant] = await db
    .select({ id: operatorGrants.id })
    .from(operatorGrants)
    .where(and(eq(operatorGrants.userId, result.user.id), isNull(operatorGrants.revokedAt)))
    .limit(1);
  if (!grant) return operatorNotFound();
  return { kind: "operator", userId: result.user.id };
}

export function isOperator(value: OperatorPrincipal | AppError): value is OperatorPrincipal {
  return "kind" in value && value.kind === "operator";
}
