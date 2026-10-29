import { tool } from "ai";
import { z } from "zod";
import type { EnvoiPublicApiClient } from "../../../clients/typescript/src/index";
import type { Trace, TraceOperation } from "./trace";

// S20: the reference agent's three tools. Each one is one call of the APIMatic-generated client;
// no tool calls fetch itself (Gate 3 reopening 2026-10-25, reference agent contract).

// At most six tool calls per buyer turn; the seventh is refused and stops the turn.
export const MAX_TOOL_CALLS = 6;
// The quantity bounds Envoi's purchase request route and the S21 one box accept.
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;

// One buyer turn's budget, set by the agent before each turn.
export type TurnGate = {
  signal: AbortSignal;
  // Counts one tool call, and throws once the turn has used its six.
  spend(): void;
};

export type CreatedLink = { url: string; expiresAt: string };

export type AgentToolsOptions = {
  // The client for the two public read routes, with no token.
  reader: EnvoiPublicApiClient;
  // The client holding the agent token, used for the purchase request alone.
  agent: EnvoiPublicApiClient;
  trace: Trace;
  gate: () => TurnGate;
  // The link goes to the person, never to the model or the trace.
  onLink: (link: CreatedLink) => void;
  now?: () => number;
};

export type ProposeBasketInput = { outletId: string; lines: { menuItemId: string; quantity: number }[] };

export function createAgentTools(options: AgentToolsOptions) {
  const now = options.now ?? Date.now;
  // The item ids the last read_menu of each outlet returned. propose_basket accepts no other id.
  const menus = new Map<string, Set<string>>();

  // Runs one generated-client call and writes its trace line. The status of an answered call comes
  // from asApiResult; a call with no answer is traced with a null status and reported as
  // unreachable, unless the turn's own budget aborted it.
  async function traced<T>(
    operation: TraceOperation,
    ids: { outletId: string | null; itemIds: string[] },
    call: () => Promise<{ ok: true; status: number; value: T } | { ok: false; status: number }>,
    expiry: (value: T) => string | null = () => null,
  ): Promise<{ ok: true; value: T } | { ok: false; status: number | null }> {
    const started = now();
    try {
      const result = await call();
      options.trace({ operation, status: result.status, ...ids, expiresAt: result.ok ? expiry(result.value) : null, ms: now() - started });
      return result.ok ? { ok: true, value: result.value } : { ok: false, status: result.status };
    } catch (err) {
      options.trace({ operation, status: null, ...ids, expiresAt: null, ms: now() - started });
      if (options.gate().signal.aborted) throw err;
      return { ok: false, status: null };
    }
  }

  async function listShops() {
    const gate = options.gate();
    gate.spend();
    const result = await traced("listOutlets", { outletId: null, itemIds: [] }, () =>
      options.reader.outlets.listOutlets({ signal: gate.signal }).asApiResult(),
    );
    if (!result.ok) return { error: result.status === null ? "unreachable" : `status_${result.status}` };
    return { shops: result.value.data.outlets.map(({ id, name, area, isDemoFixture }) => ({ id, name, area, isDemoFixture })) };
  }

  async function readMenu(input: { outletId: string }) {
    const gate = options.gate();
    gate.spend();
    const result = await traced("getOutletMenu", { outletId: input.outletId, itemIds: [] }, () =>
      options.reader.outlets.getOutletMenu({ id: input.outletId }, { signal: gate.signal }).asApiResult(),
    );
    if (!result.ok) return { error: result.status === 404 ? "not_found" : result.status === null ? "unreachable" : `status_${result.status}` };
    const { outlet, items } = result.value.data;
    menus.set(outlet.id, new Set(items.map((item) => item.id)));
    return {
      shop: { id: outlet.id, name: outlet.name, area: outlet.area, isDemoFixture: outlet.isDemoFixture },
      items: items.map(({ id, name, unitSgdCents, available }) => ({ id, name, unitSgdCents, available })),
    };
  }

  async function proposeBasket(input: ProposeBasketInput) {
    const gate = options.gate();
    gate.spend();
    const allowed = menus.get(input.outletId);
    if (!allowed) return { refused: "Read this shop's menu with read_menu first." };
    if (input.lines.length === 0) return { refused: "A basket needs at least one item." };
    for (const line of input.lines) {
      if (!allowed.has(line.menuItemId)) return { refused: `Item ${line.menuItemId} is not on the menu read_menu last returned for this shop.` };
      if (!Number.isInteger(line.quantity) || line.quantity < MIN_QUANTITY || line.quantity > MAX_QUANTITY) {
        return { refused: `A quantity must be a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.` };
      }
    }
    // The body is rebuilt from ids and quantities alone, so nothing else the model sent, such as a
    // price, total or payee, can reach Envoi.
    const body = { outletId: input.outletId, lines: input.lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })) };
    const result = await traced(
      "createPurchaseRequest",
      { outletId: body.outletId, itemIds: body.lines.map((line) => line.menuItemId) },
      () => options.agent.purchaseRequests.createPurchaseRequest({ body }, { signal: gate.signal }).asApiResult(),
      (value) => value.data.expiresAt,
    );
    if (!result.ok) return { error: result.status === null ? "unreachable" : `status_${result.status}` };
    options.onLink({ url: result.value.data.url, expiresAt: result.value.data.expiresAt });
    return { created: true, expiresAt: result.value.data.expiresAt, shownToBuyer: "Envoi's one-time link was shown to the buyer directly." };
  }

  const tools = {
    list_shops: tool({
      description: "List the shops published on Envoi: ids, names, areas and whether each is a demo fixture.",
      inputSchema: z.object({}),
      execute: () => listShops(),
    }),
    read_menu: tool({
      description: "Read one published shop's menu: item ids, names, unit prices in Singapore cents and availability. A null price or availability is unknown.",
      inputSchema: z.object({ outletId: z.string() }),
      execute: (input) => readMenu(input),
    }),
    propose_basket: tool({
      description:
        "Ask Envoi for a one-time link for exactly the items and quantities the buyer asked for at one shop. The buyer opens it, reviews Envoi's own price and approves payment themselves. Send item ids from read_menu and whole quantities only.",
      inputSchema: z.object({
        outletId: z.string(),
        lines: z.array(z.object({ menuItemId: z.string(), quantity: z.number() })),
      }),
      execute: (input) => proposeBasket(input),
    }),
  };

  return { tools, listShops, readMenu, proposeBasket };
}
