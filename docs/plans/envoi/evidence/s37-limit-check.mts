// S37 evidence harness, outside the build: sends tools/list to /mcp with a throwaway agent token and
// prints only status codes and the refusal's code. The token comes from the environment and is never
// printed. Spends the token's whole allowance, so never run it with the judge token.
//   ENVOI_CHECK_TOKEN=... npx tsx docs/plans/envoi/evidence/s37-limit-check.mts
const token = process.env.ENVOI_CHECK_TOKEN;
if (!token) throw new Error("Set ENVOI_CHECK_TOKEN to a throwaway agent token.");

const counts = new Map<number, number>();
let lastCode = "";
for (let i = 0; i < 62; i += 1) {
  const response = await fetch("https://envoi-helx.onrender.com/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/list", params: {} }),
  });
  counts.set(response.status, (counts.get(response.status) ?? 0) + 1);
  if (response.status !== 200) lastCode = ((await response.json()) as { error?: { code?: string } }).error?.code ?? "";
  else await response.text();
}
console.log("status counts:", Object.fromEntries(counts), "refusal code:", lastCode);
