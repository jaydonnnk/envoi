import { unknownRouteError } from "@/lib/errors";
import { httpErr } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// Every API path without a route answers the JSON 404 not_found that the operator routes give
// everyone but the operator, so an existing route cannot be told from an unknown one (S5). Only GET
// is exported, as on GET /health/operator, so other methods answer 405 on both.
export function GET(): Response {
  return httpErr(unknownRouteError());
}
