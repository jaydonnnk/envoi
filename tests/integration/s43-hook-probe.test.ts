import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { anonymous } from "better-auth/plugins";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authSchema } from "@/lib/db/schema";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { TEST_BASE_URL } from "../support/session";

// S43 first step (probe, not a product test): does Better Auth 1.7.7's hooks.before refuse a
// sign-up before any user, account or session row exists? The allow case proves the row count
// detects a created account, so a zero in the refuse case is not a blind scan.

let database: TestDatabase;
let close: () => Promise<void>;
let refuse = true;
let hookCalls = 0;
let auth: ReturnType<typeof build>;

function build(db: ReturnType<typeof connectWeb>["db"]) {
  return betterAuth({
    secret: "FIXTURE-probe-secret-0123456789abcdef0123456789",
    baseURL: TEST_BASE_URL,
    trustedOrigins: [TEST_BASE_URL],
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: { enabled: true },
    plugins: [anonymous({ disableDeleteAnonymousUser: true })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        hookCalls += 1;
        if (refuse) throw new APIError("TOO_MANY_REQUESTS", { code: "FIXTURE_SIGNUP_REFUSED" });
      }),
    },
    telemetry: { enabled: false },
  });
}

async function counts(email: string) {
  const [row] = await database.admin<{ users: number; accounts: number; sessions: number }[]>`
    select (select count(*)::int from "user" where email = ${email}) as users,
           (select count(*)::int from account a join "user" u on u.id = a.user_id where u.email = ${email}) as accounts,
           (select count(*)::int from session s join "user" u on u.id = s.user_id where u.email = ${email}) as sessions`;
  return row;
}

function signUp(email: string, cookie?: string) {
  return auth.handler(
    new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_BASE_URL, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ email, password: "FIXTURE-not-a-real-password", name: "FIXTURE probe" }),
    }),
  );
}

beforeAll(async () => {
  database = await createTestDatabase("s43probe");
  const web = connectWeb(database.webUrl, 2);
  close = web.close;
  auth = build(web.db);
});

afterAll(async () => {
  await close?.();
  await database?.drop();
});

describe("S43 probe: hooks.before refusal", () => {
  it("a refused sign-up creates no user, account or session", async () => {
    refuse = true;
    const before = hookCalls;
    const response = await signUp("refused@probe.example.test");
    expect(hookCalls).toBe(before + 1);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "FIXTURE_SIGNUP_REFUSED" });
    expect(await counts("refused@probe.example.test")).toEqual({ users: 0, accounts: 0, sessions: 0 });
    expect(await database.admin`select id from "user"`).toHaveLength(0);
  });

  it("a refused sign-up from a buyer session creates nothing and leaves the anonymous user alone", async () => {
    refuse = true;
    const anon = await auth.handler(new Request(`${TEST_BASE_URL}/api/auth/sign-in/anonymous`, { method: "POST", headers: { origin: TEST_BASE_URL } }));
    expect(anon.status).toBe(200);
    const cookie = anon.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const usersBefore = await database.admin<{ n: number }[]>`select count(*)::int as n from "user"`;
    const response = await signUp("refused-buyer@probe.example.test", cookie);
    expect(response.status).toBe(429);
    expect(await counts("refused-buyer@probe.example.test")).toEqual({ users: 0, accounts: 0, sessions: 0 });
    expect(await database.admin<{ n: number }[]>`select count(*)::int as n from "user"`).toEqual(usersBefore);
  });

  it("control: an allowed sign-up creates the user, its account and a session", async () => {
    refuse = false;
    const response = await signUp("allowed@probe.example.test");
    expect(response.status).toBe(200);
    expect(await counts("allowed@probe.example.test")).toEqual({ users: 1, accounts: 1, sessions: 1 });
  });
});
