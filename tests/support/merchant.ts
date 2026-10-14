import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { approveMembership, createMerchant } from "@/operator/cli";
import type { TestDatabase } from "./db";
import { TEST_BASE_URL } from "./session";

type Handler = (request: Request) => Promise<Response>;

export type TestMerchant = { email: string; password: string; userId: string };

// A throwaway merchant account made through the operator acts. The password is generated in memory
// for this run only and never written down or printed.
export async function newMerchant(database: TestDatabase, label: string, options: { membership: boolean }): Promise<TestMerchant> {
  const db = drizzle(database.admin, { schema });
  const email = `${label}-${randomBytes(4).toString("hex")}@merchant.example.test`;
  const password = randomBytes(18).toString("base64url");
  const { userId } = await createMerchant(db, { email, name: `Fixture ${label}`, password });
  if (options.membership) await approveMembership(db, { email, evidenceRef: "FIXTURE: test run" });
  return { email, password, userId };
}

// Signs in through the real Better Auth handler, sending the browser's current cookie if it has
// one, and returns the Cookie header the browser sends afterwards.
export async function signInCookie(handler: Handler, merchant: Pick<TestMerchant, "email" | "password">, cookie?: string): Promise<string> {
  const response = await handler(
    new Request(`${TEST_BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_BASE_URL, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ email: merchant.email, password: merchant.password }),
    }),
  );
  if (response.status !== 200) throw new Error(`merchant sign-in failed with ${response.status}`);
  const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]);
  if (cookies.length === 0) throw new Error("merchant sign-in set no cookie");
  return cookies.join("; ");
}

export function jsonRequest(method: string, path: string, cookie: string | null, body?: unknown, extraHeaders: Record<string, string> = {}): Request {
  return new Request(`${TEST_BASE_URL}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), origin: TEST_BASE_URL, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
