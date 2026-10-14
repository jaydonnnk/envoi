import { readOperatorHealth } from "@/domain/maintenance/health";
import { getAuth } from "@/lib/auth";
import { isOperator, requireOperator } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// The operator health view as JSON: last heartbeat, capacity and overdue work. Anyone else gets
// 404 not_found and no health data.
export async function GET(request: Request): Promise<Response> {
  const principal = await requireOperator(getAuth(), webDb(), request.headers);
  if (!isOperator(principal)) return httpErr(principal);
  return httpOk(await readOperatorHealth(webDb(), systemNow()));
}
