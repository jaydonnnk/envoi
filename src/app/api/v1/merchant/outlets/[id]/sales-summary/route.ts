import { singaporeDate } from "@/domain/purchases/order-filter";
import { salesSummary } from "@/domain/purchases/sales-summary";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Midnight in Singapore at the start of a YYYY-MM-DD date, or null for a date that does not exist.
function singaporeMidnight(date: string): Date | null {
  if (!DATE.test(date)) return null;
  const utc = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(utc.getTime()) || !utc.toISOString().startsWith(date)) return null;
  return new Date(utc.getTime() - 8 * 3_600_000);
}

// Server totals of the member's paid orders (S46; Gate 2 "GET /merchant/outlets/{id}/sales-summary"):
// `?from=YYYY-MM-DD&to=YYYY-MM-DD`, both inclusive Singapore dates, by default the last seven days.
// One summary per currency; no figure comes from a model.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const now = new Date();
  const query = new URL(request.url).searchParams;
  const to = query.get("to") ?? singaporeDate(now);
  const from = query.get("from") ?? singaporeDate(new Date(now.getTime() - 6 * DAY_MS));
  const start = singaporeMidnight(from);
  const end = singaporeMidnight(to);
  if (!start || !end || end < start) return httpErr(appError("validation_failed", "Send from and to as dates, from on or before to."));
  const endExclusive = new Date(end.getTime() + DAY_MS);
  if (endExclusive.getTime() - start.getTime() > MAX_DAYS * DAY_MS) return httpErr(appError("validation_failed", `Choose at most ${MAX_DAYS} days.`));
  return httpOk({ from, to, summaries: await salesSummary(webDb(), principal.outletId, start, endExclusive) });
}
