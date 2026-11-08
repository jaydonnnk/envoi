import { describe, expect, it } from "vitest";
import { webEnv } from "@/env";
import { touristReadyTrigger } from "@/integrations/render/workflow";

// S50: a malformed RENDER_WORKFLOW_SLUG turns the Tourist-ready trigger off instead of stopping the
// web service. Values are FIXTURE; no request is made.
describe("tourist-ready trigger configuration", () => {
  const web = {
    DATABASE_URL: "postgres://fixture@localhost/fixture",
    BETTER_AUTH_SECRET: "test-fixture-secret-0123456789abcdef0123456789",
    BETTER_AUTH_URL: "http://localhost:3000",
    APP_BASE_URL: "http://localhost:3000",
    ENVOI_ENVIRONMENT: "local",
    PAYPAL_CLIENT_ID: "fixture",
    PAYPAL_CLIENT_SECRET: "fixture",
    PAYPAL_PARTNER_ATTRIBUTION_ID: "fixture",
    PAYPAL_WEBHOOK_ID: "FIXTURE",
    PAYMENTS_ENABLED: "true",
    RENDER_API_KEY: "FIXTURE-render-key",
    NODE_ENV: "test" as const,
  };

  it("a malformed slug still boots the web service and turns the trigger off", () => {
    for (const slug of ["envoi-workflow ", "envoi-workflow/touristReady", "Envoi-Workflow"]) {
      let env: ReturnType<typeof webEnv> | "refused";
      try {
        env = webEnv({ ...web, RENDER_WORKFLOW_SLUG: slug });
      } catch {
        env = "refused";
      }
      expect(env, JSON.stringify(slug)).not.toBe("refused");
      if (env !== "refused") expect(touristReadyTrigger(env), JSON.stringify(slug)).toBeNull();
    }
  });

  it("a well-formed slug and key make a trigger", () => {
    expect(touristReadyTrigger(webEnv({ ...web, RENDER_WORKFLOW_SLUG: "envoi-workflow" }))).toBeTypeOf("function");
  });
});
