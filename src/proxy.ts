import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isOperator, requireOperator } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";

// Operator pages answer everyone but the operator with the not-found page an unknown address gets
// (S5). A notFound() from the page itself cannot do that: Next.js renders it during streaming as an
// empty error shell that only the browser's JavaScript fills in, which an unknown address never
// is. So the request is rewritten, before any rendering, to a path no route matches. The page keeps
// its own guard as well. The operator API answers through its route and the /api/v1 catch-all.
export const UNKNOWN_ROUTE_PATH = "/_envoi/unknown-route";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isOperator(await requireOperator(getAuth(), webDb(), request.headers))) return NextResponse.next();
  return NextResponse.rewrite(new URL(UNKNOWN_ROUTE_PATH, request.url));
}

export const config = { matcher: ["/operator/:path*"] };
