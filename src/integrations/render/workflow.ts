import { Render } from "@renderinc/sdk";
import type { WorkflowTrigger } from "@/domain/menu/prepare";
import { webEnv, type WebEnv } from "@/env";
import { log } from "@/lib/log";

// The flow registered by workflows/tourist-ready.ts. The only importer of Render's client (S50).
export const TOURIST_READY_FLOW = "touristReady";

const WORKFLOW_SLUG = /^[a-z0-9][a-z0-9-]*$/;

// Null unless RENDER_API_KEY and a well-formed RENDER_WORKFLOW_SLUG are both set, so CI and local runs start nothing.
// startFlow returns once Render has created the run; it never waits for the run itself.
export function touristReadyTrigger(env: Pick<WebEnv, "RENDER_API_KEY" | "RENDER_WORKFLOW_SLUG"> = webEnv()): WorkflowTrigger | null {
  const { RENDER_API_KEY: token, RENDER_WORKFLOW_SLUG: slug } = env;
  if (!token || !slug) return null;
  // A malformed slug turns the trigger off and is logged, so publishing and on-demand translation keep
  // working (S50: a bad value once stopped the web service from booting).
  if (!WORKFLOW_SLUG.test(slug)) {
    log("warn", "tourist_ready_slug_invalid");
    return null;
  }
  const render = new Render({ token });
  return async (input, signal) => {
    await render.workflows.startFlow(`${slug}/${TOURIST_READY_FLOW}`, [input], signal);
  };
}
