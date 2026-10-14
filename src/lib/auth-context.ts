import { and, eq, isNull } from "drizzle-orm";
import { appError, type AppError } from "@/lib/errors";
import type { Auth } from "@/lib/auth";
import { agentTokens } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { hashToken } from "@/lib/ids";

// Principal guards. Every route begins with exactly one require* guard from this file.

export type BuyerPrincipal = { kind: "buyer"; userId: string; isAnonymous: boolean };

// An external agent holding an out-of-band scoped demo token (Gate 3 Authorization). It may use only
// search_outlets, get_menu and create_purchase_request; it is never a buyer.
export type AgentPrincipal = { kind: "agent"; agentTokenId: string; label: string };

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
