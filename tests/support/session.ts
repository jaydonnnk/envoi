export const TEST_BASE_URL = "http://localhost:3000";

type Handler = (request: Request) => Promise<Response>;

// Signs in a fresh anonymous buyer through the real Better Auth handler and returns the Cookie
// header a browser would send afterwards.
export async function anonymousCookie(handler: Handler): Promise<string> {
  const response = await handler(
    new Request(`${TEST_BASE_URL}/api/auth/sign-in/anonymous`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_BASE_URL },
      body: "{}",
    }),
  );
  if (!response.ok) throw new Error(`anonymous sign-in failed with ${response.status}`);
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  if (cookies.length === 0) throw new Error("anonymous sign-in set no cookie");
  return cookies.join("; ");
}

export function webEnvFor(databaseUrl: string): Record<string, string> {
  return {
    DATABASE_URL: databaseUrl,
    // Fixture secret for a disposable test database; never used outside tests.
    BETTER_AUTH_SECRET: "test-fixture-secret-0123456789abcdef0123456789",
    BETTER_AUTH_URL: TEST_BASE_URL,
    APP_BASE_URL: TEST_BASE_URL,
    ENVOI_ENVIRONMENT: "local",
    LOG_LEVEL: "warn",
    // Fixture values: tests fake PayPal at the PayPalWriteClient boundary and never call it.
    PAYPAL_CLIENT_ID: "fixture-client-id",
    PAYPAL_CLIENT_SECRET: "fixture-client-secret",
    PAYPAL_PARTNER_ATTRIBUTION_ID: "fixture-attribution",
    PAYMENTS_ENABLED: "true",
  };
}
