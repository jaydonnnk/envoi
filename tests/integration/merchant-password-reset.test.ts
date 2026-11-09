import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
let sequence = 0;
const freshEmail = () => `reset-proof-${++sequence}@example.test`;
let addressSequence = 0;
const freshAddress = () => `198.51.100.${++addressSequence}`;
const password = "Fixture-signup-password-53";
const resetRequestPath = "/api/auth/request-password-reset";
const resetPath = "/api/auth/reset-password";
const signupPath = "/api/auth/sign-up/email";
const signInPath = "/api/auth/sign-in/email";
const confirmPath = "/api/v1/merchant/email/confirm";
const outletPath = "/api/v1/merchant/outlets";
const authRoute = () => import("@/app/api/auth/[...all]/route");

type Merchant = { email: string; password: string; userId: string };

beforeAll(async () => {
  db = await createTestDatabase("password_reset");
  Object.assign(process.env, webEnvFor(db.webUrl), {
    MERCHANT_SIGNUP_ENABLED: "true",
    RESEND_API_KEY: "fixture-email-key",
    MERCHANT_EMAIL_FROM: "fixture-sender@example.test",
  });
});

beforeEach(async () => {
  scheduled.length = 0;
  delivered.length = 0;
  await db.admin`delete from rate_limit_hits`;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "https://api.resend.com/emails") throw new Error("Unexpected fixture fetch");
    delivered.push(JSON.parse(String(init?.body)));
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

function textOf(mail: unknown): string {
  if (!mail || typeof mail !== "object" || !("text" in mail) || typeof mail.text !== "string") throw new Error("Missing fixture email");
  return mail.text;
}

function subjectOf(mail: unknown): string | null {
  if (!mail || typeof mail !== "object" || !("subject" in mail) || typeof mail.subject !== "string") return null;
  return mail.subject;
}

function resetLink(mail: unknown): URL {
  return fixtureConfirmationLink(textOf(mail));
}

function tokenFrom(url: URL): string {
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  if (!token) throw new Error("Missing fixture reset token");
  return token;
}

async function signup(email: string) {
  const auth = await authRoute();
  return auth.POST(jsonRequest("POST", signupPath, null, { email, password, name: "Merchant" }, { "x-forwarded-for": freshAddress() }));
}

async function requestReset(email: string, forwardedFor = freshAddress()) {
  const auth = await authRoute();
  return auth.POST(jsonRequest("POST", resetRequestPath, null, { email }, { "x-forwarded-for": forwardedFor }));
}

async function submitReset(token: string, newPassword: string) {
  const auth = await authRoute();
  return auth.POST(jsonRequest("POST", resetPath, null, { token, newPassword }));
}

// A merchant whose email is not awaiting confirmation, made the way S51's signup and confirmation do.
async function confirmedMerchant(): Promise<Merchant> {
  const email = freshEmail();
  const response = await signup(email);
  expect(response.status).toBe(200);
  await drain();
  const confirmation = delivered.find((mail) => subjectOf(mail) === "Confirm your Envoi email");
  const link = fixtureConfirmationLink(textOf(confirmation));
  const token = new URLSearchParams(link.hash.slice(1)).get("token");
  const confirm = (await import("@/app/api/v1/merchant/email/confirm/route")).POST;
  expect((await confirm(jsonRequest("POST", confirmPath, null, { token }))).status).toBe(200);
  const [row] = await db.admin<{ id: string }[]>`select id from "user" where email = ${email}`;
  if (!row) throw new Error("Fixture signup created no account");
  delivered.length = 0;
  return { email, password, userId: row.id };
}

async function seedUser(label: string, options: { anonymous: boolean; credential: boolean; verified: boolean; required: boolean }) {
  const id = `usr_fixture_${label}_${++sequence}`;
  const email = `${label}-${sequence}@example.test`;
  await db.admin`
    insert into "user" (id, name, email, email_verified, merchant_email_verification_required, is_anonymous, created_at, updated_at)
    values (${id}, 'FIXTURE', ${email}, ${options.verified}, ${options.required}, ${options.anonymous}, now(), now())
  `;
  if (options.credential) {
    await db.admin`
      insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
      values (${`acc_fixture_${label}_${sequence}`}, ${id}, 'credential', ${id}, 'fixture-password-hash', now(), now())
    `;
  }
  return { id, email };
}

const credentialCount = async (userId: string) =>
  (await db.admin<{ n: number }[]>`select count(*)::int as n from account where user_id = ${userId} and provider_id = 'credential'`)[0]?.n;
const sessionCount = async (userId: string) =>
  (await db.admin<{ n: number }[]>`select count(*)::int as n from session where user_id = ${userId}`)[0]?.n;
const passwordHash = async (userId: string) =>
  (await db.admin<{ password: string | null }[]>`select password from account where user_id = ${userId} and provider_id = 'credential'`)[0]?.password;
const signInStatus = async (email: string, candidate: string) => {
  const auth = await authRoute();
  return (await auth.POST(jsonRequest("POST", signInPath, null, { email, password: candidate }))).status;
};

it("R1: a confirmed merchant gets one reset link and signs in with the new password only", async () => {
  const merchant = await confirmedMerchant();
  const auth = await authRoute();
  const first = await signInCookie(auth.POST, merchant);
  const second = await signInCookie(auth.POST, merchant);
  expect(first).not.toBe(second);
  expect(await sessionCount(merchant.userId)).toBe(2);

  const requested = await requestReset(merchant.email);
  expect(requested.status).toBe(200);
  await expect(requested.json()).resolves.toMatchObject({ status: true });
  await drain();
  expect(delivered).toHaveLength(1);
  const mail = delivered[0] as Record<string, unknown>;
  expect(mail.to).toEqual([merchant.email]);
  expect(mail.subject).toBe("Reset your Envoi password");
  const link = resetLink(mail);
  expect(link.origin).toBe(TEST_BASE_URL);
  expect(link.pathname).toBe("/merchant/setup/reset-password");
  expect(link.search).toBe("");
  expect(link.hash).toContain("token=");
  const token = tokenFrom(link);

  const newPassword = "Fixture-reset-password-53";
  const reset = await submitReset(token, newPassword);
  expect(reset.status).toBe(200);
  await expect(reset.json()).resolves.toMatchObject({ status: true });
  expect(await sessionCount(merchant.userId)).toBe(0);
  expect(await signInStatus(merchant.email, newPassword)).toBe(200);
  expect(await signInStatus(merchant.email, password)).toBe(401);
});

it("R2: unknown, buyer, unconfirmed, passwordless and anonymous accounts get one answer and no mail", async () => {
  const unknown = freshEmail();
  const auth = await authRoute();
  const buyerCookie = await anonymousCookie(auth.POST);
  expect(buyerCookie).toBeTruthy();
  const [buyer] = await db.admin<{ id: string; email: string }[]>`
    select id, email from "user" where is_anonymous = true order by created_at desc, id desc limit 1
  `;
  if (!buyer) throw new Error("Fixture buyer was not created");

  const pendingEmail = freshEmail();
  expect((await signup(pendingEmail)).status).toBe(200);
  await drain();
  delivered.length = 0;

  const pending = await seedUser("unconfirmed", { anonymous: false, credential: true, verified: false, required: true });
  const passwordless = await seedUser("no-credential", { anonymous: false, credential: false, verified: true, required: false });
  // FIXTURE: isolates the anonymity check; a real buyer holds no credential, so the credential guard alone would hide it.
  const anonymousWithPassword = await seedUser("anonymous-credential", { anonymous: true, credential: true, verified: true, required: false });

  const emails = [unknown, buyer.email, pendingEmail, passwordless.email, anonymousWithPassword.email];
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  for (const email of emails) {
    const response = await requestReset(email);
    statuses.push(response.status);
    bodies.push(await response.json());
  }
  expect(statuses).toEqual([200, 200, 200, 200, 200]);
  for (const body of bodies) expect(body).toEqual(bodies[0]);
  await drain();
  expect(delivered).toHaveLength(0);
  expect(await credentialCount(buyer.id)).toBe(0);
  expect(await credentialCount(passwordless.id)).toBe(0);
  expect(await credentialCount(anonymousWithPassword.id)).toBe(1);
  expect(pending.id).toBeTruthy();
});

it("R3: a used token and an expired token answer INVALID_TOKEN and change nothing", async () => {
  const merchant = await confirmedMerchant();
  await requestReset(merchant.email);
  await drain();
  const token = tokenFrom(resetLink(delivered.at(-1)));
  const newPassword = "Fixture-used-once-53";
  expect((await submitReset(token, newPassword)).status).toBe(200);
  const afterFirstReset = await passwordHash(merchant.userId);

  const reused = await submitReset(token, "Fixture-reuse-attempt-53");
  expect(reused.status).toBe(400);
  await expect(reused.json()).resolves.toMatchObject({ code: "INVALID_TOKEN" });
  expect(await passwordHash(merchant.userId)).toBe(afterFirstReset);
  expect(await signInStatus(merchant.email, newPassword)).toBe(200);
  expect(await signInStatus(merchant.email, "Fixture-reuse-attempt-53")).toBe(401);

  const other = await confirmedMerchant();
  const expiredToken = `fixture-expired-${++sequence}`;
  const beforeExpired = await passwordHash(other.userId);
  await db.admin`
    insert into verification (id, identifier, value, expires_at, created_at, updated_at)
    values (${`ver_${expiredToken}`}, ${`reset-password:${expiredToken}`}, ${other.userId}, now() - interval '1 hour', now(), now())
  `;
  const expired = await submitReset(expiredToken, "Fixture-expired-attempt-53");
  expect(expired.status).toBe(400);
  await expect(expired.json()).resolves.toMatchObject({ code: "INVALID_TOKEN" });
  expect(await passwordHash(other.userId)).toBe(beforeExpired);
  expect(await signInStatus(other.email, other.password)).toBe(200);
  expect(await signInStatus(other.email, "Fixture-expired-attempt-53")).toBe(401);
});

it("R4: requests stop at ten per address and mails stop at three per inbox", async () => {
  // An operator-made merchant starts with the whole per-inbox window: no confirmation mail used it.
  const merchant = await newMerchant(db, "reset-limits", { membership: true });
  const address = "203.0.113.53";
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await requestReset(merchant.email, address);
    expect(response.status).toBe(200);
    await response.body?.cancel();
  }
  const eleventh = await requestReset(merchant.email, address);
  expect(eleventh.status).toBe(429);
  await expect(eleventh.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
  await drain();
  expect(delivered).toHaveLength(3);

  const fourth = await requestReset(merchant.email, freshAddress());
  expect(fourth.status).toBe(200);
  await drain();
  expect(delivered).toHaveLength(3);

  const serialized = JSON.stringify(await db.admin`select * from rate_limit_hits`);
  expect(serialized).not.toContain(address);
  expect(serialized).not.toContain(merchant.email);
});

it("R5: a reset changes no membership, enrollment, destination or purchase row", async () => {
  const merchant = await newMerchant(db, "reset-scope", { membership: true });
  const auth = await authRoute();
  const cookie = await signInCookie(auth.POST, merchant);
  const outlets = await import("@/app/api/v1/merchant/outlets/route");
  const created = await outlets.POST(jsonRequest("POST", outletPath, cookie, { name: "FIXTURE reset shop", area: "Bedok North" }));
  expect([200, 201]).toContain(created.status);

  const snapshot = async () => JSON.parse(JSON.stringify({
    memberships: await db.admin`select * from merchant_memberships order by id`,
    enrollments: await db.admin`select * from enrollments order by id`,
    destinations: await db.admin`select * from payment_destinations order by id`,
    purchases: await db.admin`select * from purchases order by id`,
  }));
  const before = await snapshot();
  expect(before.memberships.length).toBeGreaterThan(0);
  expect(before.enrollments.length).toBeGreaterThan(0);

  await requestReset(merchant.email);
  await drain();
  const token = tokenFrom(resetLink(delivered.at(-1)));
  expect((await submitReset(token, "Fixture-scope-password-53")).status).toBe(200);
  expect(await snapshot()).toEqual(before);
});

it("R6: without mail settings nothing is sent and the sign-in offers no reset link", async () => {
  vi.stubEnv("MERCHANT_EMAIL_FROM", undefined);
  vi.resetModules();
  try {
    const response = await requestReset(freshEmail());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "RESET_PASSWORD_DISABLED" });
    await drain();
    expect(delivered).toHaveLength(0);
    const { SignInForm } = await import("@/app/merchant/setup/sign-in");
    const markup = renderToStaticMarkup(createElement(SignInForm, { resetAvailable: false }));
    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("Forgot your password?");
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

it("R7: sign-up no longer says reset is unavailable and sign-in offers the link", async () => {
  const { SignInForm } = await import("@/app/merchant/setup/sign-in");
  const { SignUpForm } = await import("@/app/merchant/setup/sign-up");
  const signIn = renderToStaticMarkup(createElement(SignInForm, { resetAvailable: true }));
  expect(signIn).toContain("Forgot your password?");
  expect(signIn).toContain('href="/merchant/setup/forgot-password"');
  const signUp = renderToStaticMarkup(createElement(SignUpForm));
  expect(signUp).toContain("Confirm your email before you create a shop.");
  expect(signUp).not.toContain("Password reset is unavailable");
});
