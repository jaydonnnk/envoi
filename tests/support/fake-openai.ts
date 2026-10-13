// FIXTURE: a fake OpenAI Responses API at the provider's fetch boundary. No real model is called;
// every response id and model name it returns is a FIXTURE- value.

export const FIXTURE_AI_ENV = { OPENAI_API_KEY: "fixture-openai-key", AI_MODEL: "FIXTURE-model" };

export type FakeTurn =
  | { kind: "tools"; calls: { name: string; args: Record<string, unknown> }[] }
  | { kind: "answer"; proposal: Record<string, unknown> }
  | { kind: "hang" }
  | { kind: "status"; status: number };

export type FakeOpenAICall = { url: string; body: { input: unknown[]; tools?: { name: string }[] } & Record<string, unknown> };

export type FakeOpenAI = {
  fetch: typeof globalThis.fetch;
  calls: FakeOpenAICall[];
  // The function_call_output strings the SDK sent back to the model, in order.
  toolOutputs(): string[];
};

const RESPONSES_URL = "https://api.openai.com/v1/responses";

function answer(output: unknown[], index: number): Response {
  return Response.json({
    id: `FIXTURE-resp-${index}`,
    object: "response",
    created_at: 1_790_000_000,
    model: "FIXTURE-model",
    status: "completed",
    output,
    usage: { input_tokens: 1, output_tokens: 1 },
    incomplete_details: null,
  });
}

// script decides each model turn from the call index (0-based) and the request body.
export function createFakeOpenAI(script: (index: number, body: FakeOpenAICall["body"]) => FakeTurn): FakeOpenAI {
  const calls: FakeOpenAICall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== RESPONSES_URL) throw new Error(`FIXTURE fake OpenAI refuses an unexpected URL: ${url}`);
    const body = JSON.parse(String(init?.body)) as FakeOpenAICall["body"];
    const index = calls.length;
    calls.push({ url, body });
    const turn = script(index, body);
    if (turn.kind === "hang") {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason ?? new DOMException("aborted", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (turn.kind === "status") return Response.json({ error: { message: "FIXTURE failure", type: "server_error" } }, { status: turn.status });
    if (turn.kind === "tools") {
      return answer(
        turn.calls.map((call, n) => ({ type: "function_call", id: `FIXTURE-fc-${index}-${n}`, call_id: `FIXTURE-call-${index}-${n}`, name: call.name, arguments: JSON.stringify(call.args), status: "completed" })),
        index,
      );
    }
    return answer(
      [{ type: "message", id: `FIXTURE-msg-${index}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(turn.proposal), annotations: [] }] }],
      index,
    );
  }) as typeof globalThis.fetch;

  return {
    fetch,
    calls,
    // Each request repeats the whole conversation, so the last one holds every tool output.
    toolOutputs: () =>
      (calls.at(-1)?.body.input ?? []).flatMap((item) => {
        const entry = item as { type?: string; output?: unknown };
        return entry.type === "function_call_output" ? [typeof entry.output === "string" ? entry.output : JSON.stringify(entry.output)] : [];
      }),
  };
}

// A complete proposal with every field the strict schema requires.
export function proposal(fields: Partial<{ kind: string; outletIds: string[]; outletId: string | null; itemIds: string[]; area: string | null; missing: string[] }>): Record<string, unknown> {
  return { kind: "no_match", outletIds: [], outletId: null, itemIds: [], area: null, missing: [], ...fields };
}
