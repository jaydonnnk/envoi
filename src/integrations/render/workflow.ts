import { Render } from "@renderinc/sdk";
import type { WorkflowTrigger } from "@/domain/menu/prepare";
import { webEnv, type WebEnv } from "@/env";

// The flow registered by workflows/tourist-ready.ts. The only importer of Render's client (S50).
export const TOURIST_READY_FLOW = "touristReady";

// Null unless RENDER_API_KEY and RENDER_WORKFLOW_SLUG are both set, so CI and local runs start nothing.
// startFlow returns once Render has created the run; it never waits for the run itself.
export function touristReadyTrigger(env: Pick<WebEnv, "RENDER_API_KEY" | "RENDER_WORKFLOW_SLUG"> = webEnv()): WorkflowTrigger | null {
  const { RENDER_API_KEY: token, RENDER_WORKFLOW_SLUG: slug } = env;
  if (!token || !slug) return null;
  const render = new Render({ token });
  return async (input, signal) => {
    await render.workflows.startFlow(`${slug}/${TOURIST_READY_FLOW}`, [input], signal);
  };
}
