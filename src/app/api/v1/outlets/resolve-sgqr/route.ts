import { z } from "zod";
import { decodeEmvcoTlv, SGQR_MAX_PAYLOAD_CHARS } from "@/domain/sgqr/decode";
import { resolveSgqr } from "@/domain/sgqr/resolve";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// A 512-character payload fits in 4 KiB even with every character JSON-escaped; a slow or larger
// body is refused unread.
const MAX_BODY_BYTES = 4_096;
const BODY_READ_MS = 5_000;

const body = z.object({ payload: z.string().trim().min(1).max(SGQR_MAX_PAYLOAD_CHARS) }).strict();

// Buyer scan or paste (Gate 3 "Buyer scan"): a sticker's contents to zero, one or several published
// outlets. Identity only: the answer names no payee, destination or rail, and nothing is written.
// The payload lives only in this request; it is never logged, stored or echoed.
export async function POST(request: Request): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const refused = appError("validation_failed", `Paste the sticker contents, up to ${SGQR_MAX_PAYLOAD_CHARS} characters.`);
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...refused, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(refused);

  const resolution = await resolveSgqr(webDb(), decodeEmvcoTlv(parsed.data.payload));
  log("info", "sgqr_resolution", { kind: resolution.kind, candidates: resolution.kind === "ambiguous" ? resolution.candidates.length : null });
  return httpOk({ resolution });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
