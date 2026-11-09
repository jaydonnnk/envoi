import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { anonymous } from "better-auth/plugins";
import { recordAudit } from "@/domain/audit/events";
import { admitSignup } from "@/domain/outlets/signup";
import { webEnv } from "@/env";
import { authSchema } from "@/lib/db/schema";
import { webDb, type Db } from "@/lib/db/web";

// signup.enabled is MERCHANT_SIGNUP_ENABLED (S43). Off, sign-up is disabled exactly as before S43.
export type AuthOptions = { db: Db; secret: string; baseURL: string; trustedOrigins: string[]; signup: { enabled: boolean } };

const SIGN_UP_PATH = "/sign-up/email";

export function createAuth(options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    // The adapter only sees these four tables; they resolve to public through the web role's
    // pinned search_path (migration 0001), never to neon_auth.
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema }),
    // Permanent merchant accounts sign in with email and password. The operator CLI creates them
    // (create-merchant); while MERCHANT_SIGNUP_ENABLED is true a stranger may also sign up (S43).
    emailAndPassword: { enabled: true, disableSignUp: !options.signup.enabled },
    // S43 first step [verified 2026-11-09]: a refusal thrown here comes before Better Auth creates
    // any user, account or session row. Only the sign-up path is limited.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!options.signup.enabled || ctx.path !== SIGN_UP_PATH) return;
        const admission = await admitSignup(options.db, ctx.headers ?? new Headers(), options.secret, new Date());
        if (admission.kind === "rate_limited") {
          throw new APIError("TOO_MANY_REQUESTS", { code: "RATE_LIMITED", message: "Too many sign-ups for now. No account was created." });
        }
      }),
    },
    plugins: [
      anonymous({
        // Keep the anonymous user when an account is linked, so pre-link receipts stay owned.
        disableDeleteAnonymousUser: true,
        // A buyer browser signing in to a permanent account links the two. The link creates no
        // membership and moves no purchase: merchant rights come only from operator-approved
        // membership rows, and purchases keep their anonymous owner. It is recorded for the operator.
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await recordAudit(options.db, {
            at: new Date(),
            actor: "auth",
            action: "anonymous_session_linked",
            operatorVisible: true,
            details: { anonymousUserId: anonymousUser.user.id, userId: newUser.user.id },
          });
        },
      }),
    ],
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

export function getAuth(): Auth {
  if (!cached) {
    const env = webEnv();
    cached = createAuth({
      db: webDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      trustedOrigins: [env.APP_BASE_URL],
      signup: { enabled: env.MERCHANT_SIGNUP_ENABLED === "true" },
    });
  }
  return cached;
}
