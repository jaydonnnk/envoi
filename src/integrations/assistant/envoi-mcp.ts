import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { outputSchemas, type EnvoiTool, type ToolAnswers, type ToolArguments } from "../mcp/contracts";

export type EnvoiResult<T> = { ok: true; value: T; status: number | null } | { ok: false; error: string; status: number | null };
export type EnvoiConnection = {
  callEnvoi<K extends EnvoiTool>(tool: K, args: ToolArguments[K], signal: AbortSignal): Promise<EnvoiResult<ToolAnswers[K]>>;
  close(): Promise<void>;
};

const toolError = z.object({ code: z.string(), message: z.string() });

export async function connectEnvoi(baseUrl: string, agentToken: string, requestFetch: typeof globalThis.fetch = globalThis.fetch, signal?: AbortSignal): Promise<EnvoiConnection> {
  const requestStatus = new AsyncLocalStorage<{ status: number | null }>();
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${agentToken}` } },
    fetch: async (input, init) => {
      const activeSignal = signal ? AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) : init?.signal;
      const response = await requestFetch(input, { ...init, signal: activeSignal });
      const context = requestStatus.getStore();
      if (context) context.status = response.status;
      return response;
    },
  });
  const client = new Client({ name: "envoi-buyer", version: "1.0.0" });
  try {
    await client.connect(transport, { signal });
    // The SDK caches output validators when discovering tools, not when connecting.
    await client.listTools({}, { signal });
  } catch (error) {
    await client.close();
    throw error;
  }

  return {
    async callEnvoi<K extends EnvoiTool>(tool: K, args: ToolArguments[K], signal: AbortSignal): Promise<EnvoiResult<ToolAnswers[K]>> {
      const context: { status: number | null } = { status: null };
      return requestStatus.run(context, async () => {
        try {
          const result = CallToolResultSchema.parse(await client.callTool({ name: tool, arguments: args }, CallToolResultSchema, { signal }));
          if (result.isError) {
            const text = result.content.find((item) => item.type === "text");
            const parsed = toolError.safeParse(text?.type === "text" ? parseJson(text.text) : null);
            return { ok: false, error: parsed.success ? (parsed.data.code === "not_found" ? "not_found" : `status_${parsed.data.code}`) : "invalid_answer", status: context.status };
          }
          const parsed = outputSchemas[tool].safeParse(result.structuredContent);
          if (!parsed.success) return { ok: false, error: "invalid_answer", status: context.status };
          // The keyed schema has validated this answer, while TS loses the key correlation.
          return { ok: true, value: parsed.data as ToolAnswers[K], status: context.status };
        } catch (error) {
          const invalid = error instanceof z.core.$ZodError || (error instanceof McpError && (error.code === ErrorCode.InvalidParams || error.code === ErrorCode.InvalidRequest));
          return { ok: false, error: invalid ? "invalid_answer" : "unreachable", status: context.status };
        }
      });
    },
    close: () => client.close(),
  };
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
