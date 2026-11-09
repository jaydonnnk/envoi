import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { anonymous } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { recordAudit } from "@/domain/audit/events";
import { deliverMerchantConfirmation, MAX_MERCHANT_EMAIL_LENGTH } from "@/domain/outlets/email-confirmation";
import { admitSignup } from "@/domain/outlets/signup";
import { merchantMailSettings, merchantSignupOpen, webEnv, type MailSettings } from "@/env";
import { authSchema, user } from "@/lib/db/schema";
import { webDb, type Db } from "@/lib/db/web";
import { log } from "@/lib/log";

export type AuthOptions = {
  db: Db;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  signup: { enabled: boolean; mail?: MailSettings | null };
};

const SIGN_UP_PATH = "/sign-up/email";

export function createAuth(options: AuthOptions) {
  const mail = options.signup.mail;
  const signupOpen = options.signup.enabled && mail != null;
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    // The adapter only sees these four tables; they resolve to public through the web role's
    // pinned search_path (migration 0001), never to neon_auth.
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema, transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: !signupOpen, autoSignIn: false },
    disabledPaths: ["/verify-email", "/send-verification-email"],
    user: {
      additionalFields: {
        merchantEmailVerificationRequired: { type: "boolean", required: false, input: false, returned: false },
      },
    },
    emailVerification: {
      sendOnSignUp: signupOpen,
      expiresIn: 3_600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user: recipient, token }) => {
        if (!mail) return;
        try {
          after(() => deliverMerchantConfirmation({
            db: options.db,
            secret: options.secret,
            settings: mail,
            origin: options.trustedOrigins[0] ?? options.baseURL,
            recipient,
            token,
          }));
        } catch {
          log("warn", "merchant_confirmation_schedule_failed");
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data, context) => ({
            data: { ...data, merchantEmailVerificationRequired: context?.path === SIGN_UP_PATH },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [unconfirmed] = await options.db
              .select({ id: user.id })
              .from(user)
              .where(and(eq(user.id, session.userId), eq(user.merchantEmailVerificationRequired, true), eq(user.emailVerified, false)))
              .limit(1);
            if (unconfirmed) {
              throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED", message: "Confirm your email before signing in." });
            }
          },
        },
      },
    },
    // S43 first step [verified 2026-11-09]: a refusal thrown here comes before Better Auth creates
    // any user, account or session row. Only the sign-up path is limited.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!signupOpen || ctx.path !== SIGN_UP_PATH) return;
        if (typeof ctx.body?.email === "string" && ctx.body.email.length > MAX_MERCHANT_EMAIL_LENGTH) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_EMAIL", message: "Enter a valid email address." });
        }
        const admission = await admitSignup(options.db, ctx.headers ?? new Headers(), options.secret, new Date());
        if (admission.kind === "rate_limited") {
          throw new APIError("TOO_MANY_REQUESTS", { code: "RATE_LIMITED", message: "Too many sign-ups for now. No account was created." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (!signupOpen || ctx.path !== SIGN_UP_PATH) return;
        const returned: unknown = ctx.context.returned;
        if (returned instanceof APIError) {
          if (returned.body?.code !== "FAILED_TO_CREATE_USER" || typeof ctx.body?.email !== "string") return;
          // A concurrent signup can win the unique email insert after Better Auth's initial read.
          const existing = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email.toLowerCase(), { includeAccounts: true });
          if (!existing?.accounts.some((entry) => entry.providerId === "credential" && entry.accountId === existing.user.id && entry.password)) return;
        }
        return Response.json({ token: null }, { headers: { "cache-control": "no-store" } });
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
    // Auth's default logger can include database error arguments containing signup fields.
    logger: { log: (level) => log(level, "better_auth") },
    onAPIError: {
      onError: (error) => {
        if (error instanceof APIError) return;
        log("error", "better_auth_request_failed");
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Account service temporarily unavailable." });
      },
    },
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
      signup: { enabled: merchantSignupOpen(), mail: merchantMailSettings() },
    });
  }
  return cached;
}
