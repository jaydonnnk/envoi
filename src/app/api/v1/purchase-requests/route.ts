import { purchaseRequestBody, HANDOFF_BODY_BYTES, HANDOFF_BODY_READ_MS, parseJsonBytes } from "@/domain/handoffs/input";
import { createPurchaseRequest } from "@/domain/handoffs/redeem";
import { isAgent, requireAgentToken } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// An agent holding a scoped token proposes a basket and gets a link for a human to redeem. The
// answer carries the link and its expiry only: no price, no purchase id and no payment authority.
export async function POST(request: Request): Promise<Response> {
  const db = webDb();
  const agent = await requireAgentToken(db, request.headers);
  if (!isAgent(agent)) return httpErr(agent);

  const invalid = appError("validation_failed", "Send an outletId and item lines with quantities.");
  const read = await readCountedBody(request.body, HANDOFF_BODY_BYTES, HANDOFF_BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = purchaseRequestBody.safeParse(parseJsonBytes(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const created = await createPurchaseRequest(db, agent, parsed.data, new Date());
  if (created.kind === "refused") return httpErr(created.error);
  return httpOk({ url: created.url, expiresAt: created.expiresAt.toISOString() }, { status: 201 });
}
