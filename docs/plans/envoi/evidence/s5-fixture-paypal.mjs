// FIXTURE PayPal for the S5 manual runs, loaded with `node --import` ahead of the compiled
// maintenance runner. It replaces fetch for the reviewed sandbox host only: a token request gets a
// FIXTURE token, an order read gets the FIXTURE order recorded by s5-manual-run.mts, and anything
// else, including any capture, is answered 500 and logged as a violation. Every other host is
// refused, so the run makes no network call at all. The runner's own code is unchanged.
import { appendFileSync, readFileSync } from "node:fs";

const ORDERS = process.env.ENVOI_FIXTURE_PAYPAL_ORDERS;
const CALLS = process.env.ENVOI_FIXTURE_PAYPAL_CALLS;
if (!ORDERS || !CALLS) throw new Error("FIXTURE PayPal needs ENVOI_FIXTURE_PAYPAL_ORDERS and ENVOI_FIXTURE_PAYPAL_CALLS");
const orders = JSON.parse(readFileSync(ORDERS, "utf8"));
const record = (line) => appendFileSync(CALLS, `${line}\n`);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  if (url.hostname !== "api-m.sandbox.paypal.com") {
    record(`REFUSED ${method} ${url.hostname}`);
    throw new TypeError("FIXTURE PayPal: no network");
  }
  if (method === "POST" && url.pathname === "/v1/oauth2/token") {
    record("FIXTURE token");
    return json(200, { access_token: "FIXTURE-TOKEN", expires_in: 3600 });
  }
  const read = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && read) {
    const id = decodeURIComponent(read[1]);
    record(`FIXTURE read ${id}`);
    return orders[id] ? json(200, orders[id]) : json(404, { name: "RESOURCE_NOT_FOUND" });
  }
  record(`VIOLATION ${method} ${url.pathname}`);
  return json(500, { name: "FIXTURE_REFUSED" });
};
