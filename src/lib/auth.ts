import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { recordAudit } from "@/domain/audit/events";
import { webEnv } from "@/env";
import { authSchema } from "@/lib/db/schema";
import { webDb, type Db } from "@/lib/db/web";

export type AuthOptions = { db: Db; secret: string; baseURL: string; trustedOrigins: string[] };

export function createAuth(options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    // The adapter only sees these four tables; they resolve to public through the web role's
    // pinned search_path (migration 0001), never to neon_auth.
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema }),
    // Permanent merchant accounts sign in with email and password; only the operator CLI creates
    // them (create-merchant), so public signup is off.
    emailAndPassword: { enabled: true, disableSignUp: true },
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
    });
  }
  return cached;
}
