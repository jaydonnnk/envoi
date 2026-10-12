import { httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// Public readiness only: no database call, no configuration value, no secret.
export async function GET(): Promise<Response> {
  return httpOk({ status: "ok" });
}
