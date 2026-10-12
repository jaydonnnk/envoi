import { appError, type AppError } from "@/lib/errors";
import type { Auth } from "@/lib/auth";

// Principal guards. Every route begins with exactly one require* guard from this file.

export type BuyerPrincipal = { kind: "buyer"; userId: string; isAnonymous: boolean };

export async function requireBuyerSession(auth: Auth, headers: Headers): Promise<BuyerPrincipal | AppError> {
  const result = await auth.api.getSession({ headers });
  if (!result) return appError("unauthorized", "A buyer session is required.");
  return { kind: "buyer", userId: result.user.id, isAnonymous: result.user.isAnonymous === true };
}

export function isPrincipal(value: BuyerPrincipal | AppError): value is BuyerPrincipal {
  return "kind" in value && value.kind === "buyer";
}
