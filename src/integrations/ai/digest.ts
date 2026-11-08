import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { DigestLanguage, DigestModel, DigestPlaceholder } from "@/domain/purchases/digest";
import { webEnv, type WebEnv } from "@/env";
import { log, toSafeErrorRecord } from "@/lib/log";

// The one tool-free model call of the weekly summary (S47; Gate 2 "Flow: digest", Gate 3 S47
// amendment 2026-11-08). Explicit store: false, a strict schema, no tools, no retries and a time
// budget. It receives the language and the placeholder names only: never a figure, an order, the
// shop or a date. The template is never logged.

export const DIGEST_PROMPT_VERSION = "digest-prompt-2026-11-08";

const MAX_DIGEST_TEMPLATE_CHARS = 600;
// [hypothesis] A few sentences fit well inside this, including a reasoning model's own tokens.
const DIGEST_MAX_OUTPUT_TOKENS = 1_000;
const DIGEST_BUDGET_MS = 20_000;

const LANGUAGE_NAMES: Record<DigestLanguage, string> = { en: "English", zh: "Simplified Chinese", ms: "Malay", ta: "Tamil" };

const MEANINGS: Record<DigestPlaceholder, string> = {
  paid_total: "the money paid to the shop through Envoi this week",
  paid_count: "how many paid orders that was",
  net_total: "what reached the shop after PayPal's fees",
  fee_total: "what PayPal charged in fees",
};

const ModelAnswer = z.object({ template: z.string().min(1).max(MAX_DIGEST_TEMPLATE_CHARS) }).strict();

function instructions(language: DigestLanguage, placeholders: readonly DigestPlaceholder[]): string {
  return `You write a short weekly sales summary for the owner of a small food stall in Singapore, in ${LANGUAGE_NAMES[language]}.
You do not know any figure. Envoi puts each figure in for you: write a placeholder exactly as shown, with its double braces, where the figure goes.
The only placeholders you may use:
${placeholders.map((name) => `{{${name}}}: ${MEANINGS[name]}`).join("\n")}
Write one to three plain sentences that state these figures, using every placeholder above once.
Never write a number, a digit or a number word of your own, in any script, not even "one" or "a few".
Never use a placeholder that is not listed, and never write braces except around a listed placeholder.
Never compare with another week, judge how the week went, give advice, guess a reason or mention anything else, because you know nothing else.
Answer with the template only.`;
}

type FetchFunction = typeof globalThis.fetch;

export function createDigestModel(config: { apiKey: string; model: string; fetch?: FetchFunction }): DigestModel {
  const provider = createOpenAI({ apiKey: config.apiKey, fetch: config.fetch });
  return async ({ language, placeholders }) => {
    try {
      const result = await generateText({
        model: provider.responses(config.model),
        system: instructions(language, placeholders),
        prompt: `Write the template in ${LANGUAGE_NAMES[language]}.`,
        output: Output.object({ schema: ModelAnswer }),
        maxRetries: 0,
        maxOutputTokens: DIGEST_MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(DIGEST_BUDGET_MS),
        providerOptions: { openai: { store: false, strictJsonSchema: true } },
      });
      log("info", "digest_call", { model: config.model, promptVersion: DIGEST_PROMPT_VERSION, language, inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null });
      return result.output.template;
    } catch (err) {
      log("warn", "digest_failed", { model: config.model, promptVersion: DIGEST_PROMPT_VERSION, language, error: toSafeErrorRecord(err, "openai") });
      return null;
    }
  };
}

export function digestModel(env: WebEnv = webEnv()): DigestModel | null {
  if (!env.OPENAI_API_KEY || !env.AI_MODEL) return null;
  return createDigestModel({ apiKey: env.OPENAI_API_KEY, model: env.AI_MODEL });
}
