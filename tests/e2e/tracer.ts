// Session and privacy checks against a running deployment (local `next start` or Render), first
// written for S1 and kept for every redeploy. Since S2 the review is a real server-priced basket;
// no payment is started, so the receipt must read "Not paid".
//
//   npx tsx tests/e2e/tracer.ts start <baseUrl> <jarFile>   buyer journey + other-session 404; saves the session
//   npx tsx tests/e2e/tracer.ts check <baseUrl> <jarFile>   after a redeploy: same session still reads its receipt
//
// The jar holds a live session cookie, so keep it outside the repository and delete it afterwards.
import { readFileSync, writeFileSync } from "node:fs";

type Jar = { cookie: string; purchaseId: string };

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function anonymous(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: "{}",
  });
  if (!response.ok) fail(`anonymous sign-in answered ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function receipt(baseUrl: string, cookie: string, purchaseId: string): Promise<{ status: number; html: string }> {
  const response = await fetch(`${baseUrl}/receipt/${purchaseId}`, { headers: { cookie }, redirect: "manual" });
  return { status: response.status, html: await response.text() };
}

async function start(baseUrl: string, jarFile: string): Promise<void> {
  const outlets = (await (await fetch(`${baseUrl}/api/v1/outlets`)).json()) as { data: { outlets: { id: string; isDemoFixture: boolean }[] } };
  const fixture = outlets.data.outlets.find((outlet) => outlet.isDemoFixture);
  if (!fixture) fail("no demo fixture outlet listed");

  const buy = await (await fetch(`${baseUrl}/buy`)).text();
  if (!buy.includes("Demo fixture")) fail("/buy does not label the demo fixture");

  const menu = (await (await fetch(`${baseUrl}/api/v1/outlets/${fixture.id}/menu`)).json()) as { data: { items: { id: string; unitMinor: number | null }[] } };
  const item = menu.data.items.find((candidate) => candidate.unitMinor !== null);
  if (!item) fail("the demo fixture has no priced item");

  const cookie = await anonymous(baseUrl);
  const created = await fetch(`${baseUrl}/api/v1/purchases`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ outletId: fixture.id, rail: "paypal", lines: [{ menuItemId: item.id, quantity: 1 }] }),
  });
  if (created.status !== 201) fail(`POST /api/v1/purchases answered ${created.status}`);
  const { data } = (await created.json()) as { data: { purchaseId: string } };

  const own = await receipt(baseUrl, cookie, data.purchaseId);
  if (own.status !== 200 || !own.html.includes("Not paid") || own.html.includes("PayPal sandbox capture")) fail(`own receipt answered ${own.status}`);

  const other = await anonymous(baseUrl);
  const theirs = await receipt(baseUrl, other, data.purchaseId);
  const theirsApi = await fetch(`${baseUrl}/api/v1/purchases/${data.purchaseId}`, { headers: { cookie: other } });
  if (theirs.status !== 404 || theirsApi.status !== 404) fail(`other session got page ${theirs.status}, api ${theirsApi.status}`);

  writeFileSync(jarFile, JSON.stringify({ cookie, purchaseId: data.purchaseId } satisfies Jar), { mode: 0o600 });
  console.log(`PASS journey: purchase ${data.purchaseId}; own receipt 200 "Not paid"; other session page 404, api 404`);
}

async function check(baseUrl: string, jarFile: string): Promise<void> {
  const jar = JSON.parse(readFileSync(jarFile, "utf8")) as Jar;
  const own = await receipt(baseUrl, jar.cookie, jar.purchaseId);
  if (own.status !== 200 || !own.html.includes("Not paid")) fail(`same session after redeploy answered ${own.status}`);
  console.log(`PASS same session still reads receipt ${jar.purchaseId} (200)`);
}

const [command, baseUrl, jarFile] = process.argv.slice(2);
if (!baseUrl || !jarFile || (command !== "start" && command !== "check")) fail("usage: tracer.ts start|check <baseUrl> <jarFile>");
await (command === "start" ? start(baseUrl.replace(/\/$/, ""), jarFile) : check(baseUrl.replace(/\/$/, ""), jarFile));
