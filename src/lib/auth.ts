import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
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
    emailAndPassword: { enabled: false },
    plugins: [
      anonymous({
        // Keep the anonymous user when an account is linked, so pre-link receipts stay owned.
        disableDeleteAnonymousUser: true,
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
