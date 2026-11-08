import { flow, StepError, type FlowContext } from "@renderinc/sdk/workflows";
import { prepareLanguage, TOURIST_LANGUAGES, type PrepareResult, type TouristReadyInput } from "@/domain/menu/prepare";
import { workflowEnv } from "@/env";
import { menuTranslator } from "@/integrations/ai/openai";
import { connectWeb } from "@/lib/db/web";
import { TOURIST_READY_FLOW } from "@/integrations/render/workflow";

// The Tourist-ready Workflow's entry point on Render (S50; Gate 3 S50 amendment). Start command:
// `npx tsx workflows/tourist-ready.ts`. Importing this file registers the flow; the SDK starts its task
// server itself. Flow code must be deterministic on replay, so the clock is read inside each step.

const STEP_RETRY = { maxRetries: 2, waitDurationMs: 2_000, backoffScaling: 2 };

type LanguageOutcome = { language: string; result: PrepareResult | "failed" };

async function prepareStep(input: TouristReadyInput, language: string): Promise<PrepareResult> {
  const env = workflowEnv();
  const translator = menuTranslator(env);
  if (!translator) throw new Error("translation is not configured");
  const { db, close } = connectWeb(env.DATABASE_URL, 1);
  try {
    return await prepareLanguage(db, input, language, new Date(), translator);
  } finally {
    await close();
  }
}

export const touristReady = flow(
  { name: TOURIST_READY_FLOW, timeoutSeconds: 600 },
  async function touristReady(ctx: FlowContext, input: TouristReadyInput): Promise<LanguageOutcome[]> {
    const outcomes: LanguageOutcome[] = [];
    for (const language of TOURIST_LANGUAGES) {
      try {
        outcomes.push({ language, result: await ctx.step(language, prepareStep, [input, language], { retry: STEP_RETRY }) });
      } catch (err) {
        // A language that still fails after its retries is left to on-demand translation.
        if (!(err instanceof StepError)) throw err;
        outcomes.push({ language, result: "failed" });
      }
    }
    return outcomes;
  },
);
