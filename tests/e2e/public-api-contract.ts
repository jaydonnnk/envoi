// S14: checks a running deployment's public read routes against openapi/envoi-public.yaml, the same
// check the integration test runs on the route handlers. Reads only; nothing is created or paid.
//
//   npx tsx tests/e2e/public-api-contract.ts <baseUrl>
import { randomBytes } from "node:crypto";
import { checkResponse, loadDocument } from "../support/openapi";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: npx tsx tests/e2e/public-api-contract.ts <baseUrl>");
  process.exit(2);
}

const document = loadDocument();
let failed = false;

async function check(label: string, template: string, path: string): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`);
  const errors = await checkResponse(document, template, "GET", response.clone());
  console.log(`${errors.length === 0 ? "PASS" : "FAIL"} ${label}: GET ${path} ${response.status}`);
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

process.exit(failed ? 1 : 0);
