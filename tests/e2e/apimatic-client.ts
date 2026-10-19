// S14: the APIMatic-generated TypeScript client (clients/typescript, generated from
// openapi/envoi-public.yaml) lists shops and reads a demo fixture menu from a running deployment,
// then reads an unknown shop to show the documented 404 arrives as the client's typed error.
// Reads only; nothing is created or paid.
//
//   npx tsx tests/e2e/apimatic-client.ts <baseUrl>
import { randomBytes } from "node:crypto";
import { EnvoiPublicReadApiClient } from "../../clients/typescript/src/index";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: npx tsx tests/e2e/apimatic-client.ts <baseUrl>");
  process.exit(2);
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

const client = new EnvoiPublicReadApiClient({ serverOptions: { baseUrl } });
const price = (cents: number | null) => (cents === null ? "price unknown" : `S$${(cents / 100).toFixed(2)}`);
const availability = (available: boolean | null) => (available === null ? "availability unknown" : available ? "available" : "unavailable");

console.log(`TEST ENVIRONMENT at ${baseUrl}: demo fixture shops, PayPal sandbox test money only.`);

const { data } = await client.listOutlets();
console.log(`listOutlets: ${data.outlets.length} published shop(s)`);
for (const outlet of data.outlets) console.log(`  ${outlet.id}  ${outlet.name} (${outlet.area})${outlet.isDemoFixture ? "  [DEMO FIXTURE]" : ""}`);

const shop = data.outlets.find((outlet) => outlet.isDemoFixture) ?? fail("no demo fixture shop listed");
const menu = await client.getOutletMenu({ id: shop.id });
if (menu.data.outlet.id !== shop.id) fail(`menu answered for ${menu.data.outlet.id}, not ${shop.id}`);
if (menu.data.items.length === 0) fail("the demo fixture menu has no items");
console.log(`getOutletMenu(${shop.id}): revision ${menu.data.menuRevisionId}, ${menu.data.items.length} item(s)`);
for (const item of menu.data.items) console.log(`  ${item.name}  ${price(item.unitSgdCents)}  ${availability(item.available)}`);

const unknown = `out_${[...randomBytes(26)].map((byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32]).join("")}`;
const missing = await client.getOutletMenu({ id: unknown }).asApiResult();
if (missing.ok) fail(`unknown shop ${unknown} answered a menu`);
if (missing.status !== 404 || missing.payload.kind !== "notFoundResponse") fail(`unknown shop answered ${missing.status} ${missing.payload.kind}`);
console.log(`getOutletMenu(${unknown}): ${missing.status} ${missing.payload.body.error.code}, "${missing.payload.body.error.message}"`);
console.log("PASS");
