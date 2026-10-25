// S14: checks a running deployment's public read routes against openapi/envoi-public.yaml, the same
// check the integration test runs on the route handlers. Reads only; nothing is created or paid.
// S19: it also sends the agent's purchase request with no token, which must answer the documented 401.
//
//   npx tsx tests/e2e/public-api-contract.ts <baseUrl> [nul]
import { randomBytes } from "node:crypto";
import { checkResponse, loadDocument } from "../support/openapi";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: npx tsx tests/e2e/public-api-contract.ts <baseUrl> [nul]");
  process.exit(2);
}

const document = loadDocument();
let failed = false;

async function check(label: string, template: string, path: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const response = await fetch(`${baseUrl}${path}`, init);
  const errors = await checkResponse(document, template, method, response.clone());
  console.log(`${errors.length === 0 ? "PASS" : "FAIL"} ${label}: ${method} ${path} ${response.status}`);
  for (const error of errors) console.log(`  ${error}`);
  failed ||= errors.length > 0;
  return response;
}

const list = (await (await check("list", "/api/v1/outlets", "/api/v1/outlets")).json()) as { data?: { outlets: { id: string; isDemoFixture: boolean }[] } };
const shop = list.data?.outlets.find((outlet) => outlet.isDemoFixture);
if (shop) await check("demo fixture menu", "/api/v1/outlets/{id}/menu", `/api/v1/outlets/${shop.id}/menu`);
else {
  console.log("FAIL no demo fixture shop listed, so no menu was checked");
  failed = true;
}
// A well-formed id that names no shop, so the documented 404 is exercised too.
const unknown = `out_${[...randomBytes(26)].map((byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32]).join("")}`;
const missing = await check("unknown shop", "/api/v1/outlets/{id}/menu", `/api/v1/outlets/${unknown}/menu`);
if (missing.status !== 404) failed = true;
// S14 review fix 1: ids no shop can have, including an encoded NUL byte, answer the documented 404.
// Some hosts refuse an encoded NUL before the app sees it (Render answers 400), so pass "nul" as a
// third argument only where the app itself receives it, as in the CI run.
for (const [label, id] of [["short id", "x"], ...(process.argv[3] === "nul" ? [["NUL byte id", "%00"]] : [])] as [string, string][]) {
  if ((await check(label, "/api/v1/outlets/{id}/menu", `/api/v1/outlets/${id}/menu`)).status !== 404) failed = true;
}

const noToken = await check("purchase request with no token", "/api/v1/purchase-requests", "/api/v1/purchase-requests", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ outletId: shop?.id ?? unknown, lines: [{ menuItemId: "itm_unknown", quantity: 1 }] }),
});
if (noToken.status !== 401) failed = true;

process.exit(failed ? 1 : 0);
