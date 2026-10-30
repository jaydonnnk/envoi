// S14: the APIMatic-generated TypeScript client (clients/typescript, generated from
// openapi/envoi-public.yaml) lists shops and reads a demo fixture menu from a running deployment,
// then reads an unknown shop to show the documented 404 arrives as the client's typed error.
// S19: with an agent token in ENVOI_AGENT_TOKEN, it also creates one purchase request for one item
// of that menu and receives the buyer's link, then sends the same request with no token and gets
// the typed 401. Nothing is paid: the link only opens a review a human must approve. The token is
// read from the environment and never printed.
//
//   ENVOI_AGENT_TOKEN=... npx tsx tests/e2e/apimatic-client.ts <baseUrl> [shop name]
import { randomBytes } from "node:crypto";
import { EnvoiPublicApiClient } from "../../clients/typescript/src/index";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: ENVOI_AGENT_TOKEN=... npx tsx tests/e2e/apimatic-client.ts <baseUrl> [shop name]");
  process.exit(2);
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

const agentToken = process.env.ENVOI_AGENT_TOKEN;
if (!agentToken) fail("ENVOI_AGENT_TOKEN is not set, so no purchase request can be created");
const shopName = process.argv[3];
const client = new EnvoiPublicApiClient({ serverOptions: { baseUrl } });
const agent = new EnvoiPublicApiClient({ serverOptions: { baseUrl }, agentBearer: agentToken });
const price = (cents: number | null) => (cents === null ? "price unknown" : `S$${(cents / 100).toFixed(2)}`);
const availability = (available: boolean | null) => (available === null ? "availability unknown" : available ? "available" : "unavailable");

console.log(`TEST ENVIRONMENT at ${baseUrl}: demo fixture shops, PayPal sandbox test money only.`);

const { data } = await client.outlets.listOutlets();
console.log(`listOutlets: ${data.outlets.length} published shop(s)`);
for (const outlet of data.outlets) console.log(`  ${outlet.id}  ${outlet.name} (${outlet.area})${outlet.isDemoFixture ? "  [DEMO FIXTURE]" : ""}`);

const shop =
  data.outlets.find((outlet) => outlet.isDemoFixture && (shopName === undefined || outlet.name === shopName)) ??
  fail(shopName ? `no demo fixture shop named ${shopName} listed` : "no demo fixture shop listed");
const menu = await client.outlets.getOutletMenu({ id: shop.id });
if (menu.data.outlet.id !== shop.id) fail(`menu answered for ${menu.data.outlet.id}, not ${shop.id}`);
if (menu.data.items.length === 0) fail("the demo fixture menu has no items");
console.log(`getOutletMenu(${shop.id}): revision ${menu.data.menuRevisionId}, ${menu.data.items.length} item(s)`);
for (const item of menu.data.items) console.log(`  ${item.name}  ${price(item.unitMinor)}  ${availability(item.available)}`);

const unknown = `out_${[...randomBytes(26)].map((byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32]).join("")}`;
const missing = await client.outlets.getOutletMenu({ id: unknown }).asApiResult();
if (missing.ok) fail(`unknown shop ${unknown} answered a menu`);
if (missing.status !== 404 || missing.payload.kind !== "notFoundResponse") fail(`unknown shop answered ${missing.status} ${missing.payload.kind}`);
console.log(`getOutletMenu(${unknown}): ${missing.status} ${missing.payload.body.error.code}, "${missing.payload.body.error.message}"`);

const item = menu.data.items.find((candidate) => candidate.available === true && candidate.unitMinor !== null) ?? fail("no available, priced item on the menu");
const body = { outletId: shop.id, lines: [{ menuItemId: item.id, quantity: 1 }] };
const created = await agent.purchaseRequests.createPurchaseRequest({ body });
if (!/\/approve\/[a-z2-7]{52}$/.test(created.data.url)) fail("the purchase request answered no approval link");
const minutesLeft = (Date.parse(created.data.expiresAt) - Date.now()) / 60_000;
if (!(minutesLeft > 9 && minutesLeft <= 10)) fail(`the link expires in ${minutesLeft.toFixed(1)} minutes, not about 10`);
// The link is a one-time credential for the buyer, so only its origin and path prefix are printed.
console.log(`createPurchaseRequest(1 x ${item.name} at ${shop.name}): 201, link ${new URL(created.data.url).origin}/approve/<one-time token>, expires ${created.data.expiresAt}`);

const anonymous = await client.purchaseRequests.createPurchaseRequest({ body }).asApiResult();
if (anonymous.ok) fail("a purchase request without a token was created");
if (anonymous.status !== 401 || anonymous.payload.kind !== "unauthorizedResponse") fail(`no token answered ${anonymous.status} ${anonymous.payload.kind}`);
console.log(`createPurchaseRequest with no token: ${anonymous.status} ${anonymous.payload.body.error.code}, "${anonymous.payload.body.error.message}"`);
console.log("PASS");
