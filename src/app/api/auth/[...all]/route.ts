import { getAuth } from "@/lib/auth";

// Better Auth routes, outside /api/v1. The instance is built on first request, not at build time.
export async function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
