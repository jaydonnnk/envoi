// S20: the reference agent's trace, one JSON line per generated-client call. Each line is built
// from the named fields below and nothing else, so a token, key, link, link token or model prompt
// has no field to land in (Gate 3 reopening 2026-10-25, reference agent contract).

export type TraceOperation = "listOutlets" | "getOutletMenu" | "createPurchaseRequest";

export type TraceEntry = {
  operation: TraceOperation;
  // The HTTP status, or null when no response arrived (a connection failure or a timeout).
  status: number | null;
  outletId: string | null;
  itemIds: string[];
  // The purchase request's expiry, on a created link only.
  expiresAt: string | null;
  ms: number;
};

export type Trace = (entry: TraceEntry) => void;

export function createTrace(write: (line: string) => void): Trace {
  return (entry) =>
    write(
      JSON.stringify({
        operation: entry.operation,
        status: entry.status,
        outletId: entry.outletId,
        itemIds: entry.itemIds,
        expiresAt: entry.expiresAt,
        ms: entry.ms,
      }),
    );
}
