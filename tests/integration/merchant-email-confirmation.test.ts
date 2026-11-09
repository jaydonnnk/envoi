import { createEmailVerificationToken } from "better-auth/api";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { fixtureConfirmationLink, jsonRequest, newMerchant, signInCookie } from "../support/merchant";
import { anonymousCookie, TEST_BASE_URL, webEnvFor } from "../support/session";

const scheduled = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => { scheduled.push(task); },
}));

let db: TestDatabase;
const delivered: unknown[] = [];
const password = "Fixture-signup-password-51";
let sequence = 0;
const freshEmail = () => `signup-proof-${++sequence}@example.test`;
const signupPath = "/api/auth/sign-up/email";
const signInPath = "/api/auth/sign-in/email";
const confirmPath = "/api/v1/merchant/email/confirm";
const resendPath = "/api/v1/merchant/email/resend";
const outletPath = "/api/v1/merchant/outlets";
const address = "198.51.100.15";
const emailNeedle = "FIXTURE_FAILURE_ADDRESS";
const providerNeedle = "FIXTURE_FAILURE_TOKEN";
let deliveryMode: "accepted" | "rejected" | "timeout" = "accepted";
const authRoute = () => import("@/app/api/auth/[...all]/route");

beforeAll(async () => {
  db = await createTestDatabase("email_confirmation");
  Object.assign(process.env, webEnvFor(db.webUrl), {
    MERCHANT_SIGNUP_ENABLED: "true",
    RESEND_API_KEY: "fixture-email-key",
    MERCHANT_EMAIL_FROM: "fixture-sender@example.test",
  });
});

beforeEach(async () => {
  scheduled.length = 0;
  delivered.length = 0;
  deliveryMode = "accepted";
  await db.admin`delete from rate_limit_hits`;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "https://api.resend.com/emails") throw new Error("Unexpected fixture fetch");
    delivered.push(JSON.parse(String(init?.body)));
    if (deliveryMode === "timeout") throw new DOMException(providerNeedle, "TimeoutError");
    if (deliveryMode === "rejected") return Response.json({ message: providerNeedle }, { status: 503 });
    return Response.json({ id: "fixture-mail" });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.drop();
});

async function drain() {
  for (const task of scheduled.splice(0)) await task();
}

it("public signup stores the confirmation requirement and creates no session", async () => {
  const email = freshEmail();
  const response = await signup(email);
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  await expect(response.json()).resolves.toMatchObject({ token: null });
  await drain();
  expect(delivered).toHaveLength(1);
  expect(await db.admin`
    select u.merchant_email_verification_required, u.email_verified,
      exists(select 1 from account where user_id = u.id and provider_id = 'credential') as credential,
      exists(select 1 from session where user_id = u.id) as session,
      exists(select 1 from merchant_memberships where user_id = u.id) as membership
    from "user" u where u.email = ${email}
  `).toEqual([{ merchant_email_verification_required: true, email_verified: false, credential: true, session: false, membership: false }]);
});

async function signup(email: string, extra: Record<string, unknown> = {}, cookie: string | null = null) {
  const auth = await authRoute();
  return auth.POST(jsonRequest("POST", signupPath, cookie, { email, password, name: "Merchant", ...extra }, { "x-forwarded-for": address }));
}

async function pendingAccount(email = freshEmail()) {
  const response = await signup(email);
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  const [row] = await db.admin<{ id: string }[]>`select id from "user" where email = ${email}`;
  if (!row) throw new Error("Fixture signup created no account");
  return { email, password, id: row.id };
}

function lastLink(): URL {
  const mail = delivered.at(-1);
  if (!mail || typeof mail !== "object" || !("text" in mail) || typeof mail.text !== "string") throw new Error("Missing fixture email");
  return fixtureConfirmationLink(mail.text);
}

function tokenFrom(url: URL): string {
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  if (!token) throw new Error("Missing fixture confirmation token");
  return token;
}

const isVerified = async (email: string) => (await db.admin<{ email_verified: boolean }[]>`select email_verified from "user" where email = ${email}`)[0]?.email_verified;
const shopCount = async () => (await db.admin<{ n: number }[]>`select count(*)::int as n from outlets`)[0]?.n;

it("rejects browser control of both verification fields and never signs a duplicate signup in", async () => {
  const email = freshEmail();
  const forged = await signup(email, { emailVerified: true });
  expect([200, 400]).toContain(forged.status);
  expect(forged.headers.getSetCookie()).toHaveLength(0);
  if (forged.ok) {
    await expect(forged.json()).resolves.toEqual({ token: null });
    expect(await db.admin`select merchant_email_verification_required, email_verified from "user" where email = ${email}`).toEqual([
      { merchant_email_verification_required: true, email_verified: false },
    ]);
  } else {
    expect(await db.admin`select id from "user" where email = ${email}`).toHaveLength(0);
    await pendingAccount(email);
  }
  await drain();
  expect(delivered).toHaveLength(1);
  const duplicate = await signup(email);
  expect(duplicate.status).toBe(200);
  expect(duplicate.headers.getSetCookie()).toHaveLength(0);
  await expect(duplicate.json()).resolves.toMatchObject({ token: null });
  await drain();
  expect(delivered).toHaveLength(1);
});

it("the merchant cohort flag is server-owned on signup and account update", async () => {
  const email = freshEmail();
  const forged = await signup(email, { merchantEmailVerificationRequired: false });
  expect([200, 400]).toContain(forged.status);
  if (forged.ok) {
    await expect(forged.json()).resolves.toEqual({ token: null });
    expect(await db.admin`select merchant_email_verification_required from "user" where email = ${email}`).toEqual([
      { merchant_email_verification_required: true },
    ]);
  } else {
    expect(await db.admin`select id from "user" where email = ${email}`).toHaveLength(0);
  }

  const legacy = await newMerchant(db, "s51-cohort-legacy", { membership: true });
  const auth = await authRoute();
  const cookie = await signInCookie(auth.POST, legacy);
  await auth.POST(jsonRequest("POST", "/api/auth/update-user", cookie, { merchantEmailVerificationRequired: true }));
  expect(await db.admin`select merchant_email_verification_required from "user" where id = ${legacy.userId}`).toEqual([
    { merchant_email_verification_required: false },
  ]);
});

it("new unconfirmed users cannot sign in or create a pending shop", async () => {
  const merchant = await pendingAccount();
  const auth = await authRoute();
  const wrongPassword = await auth.POST(jsonRequest("POST", signInPath, null, { email: merchant.email, password: "Wrong-fixture-password" }));
  expect(wrongPassword.status).toBe(401);
  await expect(wrongPassword.json()).resolves.toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
  const signin = await auth.POST(jsonRequest("POST", signInPath, null, { email: merchant.email, password }));
  expect(signin.status).toBe(403);
  await expect(signin.json()).resolves.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  expect(signin.headers.getSetCookie()).toHaveLength(0);
  expect(await db.admin`select id from session where user_id = ${merchant.id}`).toHaveLength(0);

  const before = await shopCount();
  const outlets = await import("@/app/api/v1/merchant/outlets/route");
  const attempt = await outlets.POST(jsonRequest("POST", outletPath, null, { name: "FIXTURE shop", area: "Bedok North" }));
  expect(attempt.status).toBe(401);
  const web = postgres(db.webUrl, { max: 1 });
  try {
    await expect(web`select create_self_signup_outlet(${merchant.id}, 'FIXTURE shop', 'Bedok North', now())`).rejects.toThrow("self_signup_refused: email_unconfirmed");
  } finally {
    await web.end();
  }
  expect(await shopCount()).toBe(before);
});

it("confirmation proves mailbox token and does not sign in", async () => {
  const merchant = await pendingAccount();
  const other = await pendingAccount();
  await drain();
  const link = lastLink();
  expect(link.origin).toBe(TEST_BASE_URL);
  expect(link.pathname).toBe("/merchant/setup/confirm-email");
  expect(link.search).toBe("");
  const token = tokenFrom(link);
  const auth = await authRoute();
  const oldPath = new URL("/api/auth/verify-email", TEST_BASE_URL);
  oldPath.searchParams.set("token", token);
  expect((await auth.GET(new Request(oldPath))).status).toBe(404);
  expect(await isVerified(other.email)).toBe(false);

  const confirm = (await import("@/app/api/v1/merchant/email/confirm/route")).POST;
  const expired = await createEmailVerificationToken(webEnvFor(db.webUrl).BETTER_AUTH_SECRET!, other.email, undefined, -60);
  const altered = token.slice(0, token.lastIndexOf(".") + 1) + "invalid";
  for (const bad of [altered, expired]) {
    const rejected = await confirm(jsonRequest("POST", confirmPath, null, { token: bad }));
    expect(rejected.status).toBe(400);
    expect(await isVerified(other.email)).toBe(false);
  }
  for (let i = 0; i < 2; i++) {
    const confirmed = await confirm(jsonRequest("POST", confirmPath, null, { token }));
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.getSetCookie()).toHaveLength(0);
    expect(confirmed.headers.get("cache-control")).toBe("no-store");
  }
  expect(await isVerified(merchant.email)).toBe(false);
  expect(await isVerified(other.email)).toBe(true);
  expect(await db.admin`select id from session where user_id = ${other.id}`).toHaveLength(0);
  const cookie = await signInCookie(auth.POST, other);
  const outlets = await import("@/app/api/v1/merchant/outlets/route");
  const created = await outlets.POST(jsonRequest("POST", outletPath, cookie, { name: "FIXTURE confirmed shop", area: "Bedok North" }));
  expect(created.status).toBe(201);
});

it("confirmation and resend accept only same-origin requests", async () => {
  const merchant = await pendingAccount();
  await drain();
  const token = tokenFrom(lastLink());
  const confirm = (await import("@/app/api/v1/merchant/email/confirm/route")).POST;
  const resend = (await import("@/app/api/v1/merchant/email/resend/route")).POST;
  for (const origin of [null, "https://foreign.example.test"]) {
    const confirmation = jsonRequest("POST", confirmPath, null, { token });
    const retry = jsonRequest("POST", resendPath, null, { email: merchant.email });
    for (const request of [confirmation, retry]) {
      if (origin === null) request.headers.delete("origin");
      else request.headers.set("origin", origin);
    }
    expect((await confirm(confirmation)).status).toBe(403);
    expect((await resend(retry)).status).toBe(403);
  }
  await drain();
  expect(delivered).toHaveLength(1);
  expect(await isVerified(merchant.email)).toBe(false);
});

it("resend conceals account state and tolerates an anonymous cookie", async () => {
  const pending = await pendingAccount();
  const verified = await pendingAccount();
  const legacy = await newMerchant(db, "email-legacy", { membership: true });
  await db.admin`update "user" set email_verified = true where id = ${verified.id}`;
  await drain();
  delivered.length = 0;
  const auth = await authRoute();
  const cookie = await anonymousCookie(auth.POST);
  const resend = (await import("@/app/api/v1/merchant/email/resend/route")).POST;
  for (const email of [pending.email, legacy.email, verified.email, freshEmail()]) {
    const response = await resend(jsonRequest("POST", resendPath, cookie, { email }, { "x-forwarded-for": address }));
    expect(response.status).toBe(202);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { accepted: true } });
  }
  await drain();
  expect(delivered).toHaveLength(1);
  expect(delivered[0]).toMatchObject({ to: [pending.email] });
  expect((await auth.POST(jsonRequest("POST", "/api/auth/send-verification-email", null, { email: pending.email }))).status).toBe(404);
});

it("confirmation limits hold under retry and concurrency", async () => {
  const merchant = await pendingAccount();
  await drain();
  const resend = (await import("@/app/api/v1/merchant/email/resend/route")).POST;
  const request = (email: string, forwardedFor = address) => resend(jsonRequest("POST", resendPath, null, { email }, { "x-forwarded-for": forwardedFor }));
  expect((await request(merchant.email.toUpperCase())).status).toBe(202);
  await drain();
  const scheduledRequests = await Promise.all(Array.from({ length: 8 }, (_, i) => request(merchant.email, `203.0.113.${i + 1}, ${address}`)));
  expect(scheduledRequests.every(response => response.status === 202)).toBe(true);
  await Promise.all(scheduled.splice(0).map(task => task()));
  expect(delivered).toHaveLength(3);
  expect((await request(freshEmail())).status).toBe(202);
  expect((await request(freshEmail(), `203.0.113.100, ${address}`)).status).toBe(429);

  const last = await pendingAccount();
  // Reset fixture buckets and preload every aggregate slot except one.
  await db.admin`delete from rate_limit_hits`;
  await db.admin`
    insert into rate_limit_hits(id, bucket, subject, at)
    select 'fixture-email-' || n, 'merchant_email_delivery', 'fixture-' || n, now()
    from generate_series(1,49) n
  `;
  delivered.length = 0;
  const admitted = await Promise.all([request(last.email), request(merchant.email)]);
  expect(admitted.every(response => response.status === 202)).toBe(true);
  await Promise.all(scheduled.splice(0).map(task => task()));
  expect(delivered).toHaveLength(1);
  const serialized = async () => JSON.stringify(await db.admin`select * from rate_limit_hits`);
  await db.admin`insert into rate_limit_hits(id, bucket, subject, at) values ('fixture-needle', 'merchant_email_resend', ${address}, now())`;
  expect(await serialized()).toContain(address);
  await db.admin`delete from rate_limit_hits where id = 'fixture-needle'`;
  const records = await serialized();
  expect(records).not.toContain(address);
  expect(records).not.toContain(merchant.email);
});

it("provider failure leaves a recoverable account", async () => {
  const warn = vi.spyOn(console, "error").mockImplementation(() => {});
  const email = emailNeedle.toLowerCase().replaceAll("_", "-") + "@example.test";
  try {
    deliveryMode = "timeout";
    const merchant = await pendingAccount(email);
    await drain();
    expect(await isVerified(merchant.email)).toBe(false);
    expect(delivered).toHaveLength(1);
    deliveryMode = "rejected";
    const resend = (await import("@/app/api/v1/merchant/email/resend/route")).POST;
    const rejected = await resend(jsonRequest("POST", resendPath, null, { email }));
    const rejectedBody = await rejected.text();
    expect(rejected.status).toBe(202);
    await drain();
    expect(await isVerified(email)).toBe(false);
    expect(delivered).toHaveLength(2);
    deliveryMode = "accepted";
    expect((await resend(jsonRequest("POST", resendPath, null, { email }))).status).toBe(202);
    await drain();
    expect(delivered).toHaveLength(3);
    const token = tokenFrom(lastLink());
    const confirm = (await import("@/app/api/v1/merchant/email/confirm/route")).POST;
    expect((await confirm(jsonRequest("POST", confirmPath, null, { token }))).status).toBe(200);
    expect(await isVerified(email)).toBe(true);
    const surface = () => JSON.stringify(warn.mock.calls) + rejectedBody;
    const needles = [email, token, providerNeedle];
    const matches = () => needles.filter(needle => surface().includes(needle));
    expect(surface()).toContain("merchant_confirmation_delivery_failed");
    warn.mock.calls.push([JSON.stringify({ address: email, token, payload: providerNeedle })]);
    expect(matches()).toEqual(needles);
    warn.mock.calls.pop();
    expect(matches()).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});

it("missing sender config closes public signup without locking out existing accounts", async () => {
  const merchant = await pendingAccount();
  const legacy = await newMerchant(db, "s51-existing", { membership: true });
  await drain();
  const token = tokenFrom(lastLink());
  vi.stubEnv("MERCHANT_EMAIL_FROM", undefined);
  vi.resetModules();
  try {
    const auth = await authRoute();
    const candidate = freshEmail();
    expect((await signup(candidate)).status).toBe(400);
    expect(await db.admin`select id from "user" where email = ${candidate}`).toHaveLength(0);
    expect(await signInCookie(auth.POST, legacy)).toBeTruthy();
    const confirm = (await import("@/app/api/v1/merchant/email/confirm/route")).POST;
    expect((await confirm(jsonRequest("POST", confirmPath, null, { token }))).status).toBe(200);
    expect(await isVerified(merchant.email)).toBe(true);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

it("a failed credential insert leaves no signup row and the merchant can retry", async () => {
  const email = freshEmail();
  const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  await db.admin`
    create function fixture_refuse_credential() returns trigger language plpgsql as $$
    begin raise exception 'FIXTURE credential insert failure'; end $$`;
  await db.admin`create trigger fixture_refuse_credential before insert on account
    for each row execute function fixture_refuse_credential()`;
  try {
    const response = await signup(email);
    expect(response.ok).toBe(false);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(await db.admin`select id from "user" where email = ${email}`).toHaveLength(0);
    await drain();
    expect(delivered).toHaveLength(0);
    const recorded = JSON.stringify(logs.mock.calls.map(args => args.map(value => value instanceof Error ? value.message : value)));
    expect(recorded).toContain("better_auth_request_failed");
    expect(recorded).not.toContain(email);
    expect(recorded).not.toContain("params:");
    expect(recorded).not.toContain("FIXTURE credential insert failure");
  } finally {
    logs.mockRestore();
    await db.admin`drop trigger fixture_refuse_credential on account`;
    await db.admin`drop function fixture_refuse_credential()`;
  }
  await pendingAccount(email);
  await drain();
  expect(delivered).toHaveLength(1);
});

it("concurrent signup requests for the same inbox get one neutral response shape", async () => {
  const email = freshEmail();
  await db.admin`create function fixture_slow_user_insert() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.2); return new; end $$`;
  await db.admin`create trigger fixture_slow_user_insert before insert on "user"
    for each row execute function fixture_slow_user_insert()`;
  try {
    const responses = await Promise.all([signup(email), signup(email)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    for (const response of responses) {
      expect(response.headers.getSetCookie()).toHaveLength(0);
      await expect(response.json()).resolves.toEqual({ token: null });
    }
    const [row] = await db.admin`
      select count(*)::int as n from "user" u join account a on u.id = a.user_id where u.email = ${email}`;
    expect(row).toEqual({ n: 1 });
    await drain();
    expect(delivered).toHaveLength(1);
  } finally {
    await db.admin`drop trigger fixture_slow_user_insert on "user"`;
    await db.admin`drop function fixture_slow_user_insert()`;
  }
});

it("rejects an address that cannot fit the resend contract before creating an account", async () => {
  const email = "a".repeat(244) + "@example.test";
  expect(email.length).toBeGreaterThan(254);
  expect((await signup(email)).status).toBe(400);
  expect(await db.admin`select id from "user" where email = ${email}`).toHaveLength(0);
  expect(await db.admin`select id from rate_limit_hits`).toHaveLength(0);
  await drain();
  expect(delivered).toHaveLength(0);
});
