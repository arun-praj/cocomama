import { randomUUID } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP, magicLink } from "better-auth/plugins";
import { env } from "./config/env.js";
import { db } from "./db/client.js";
import * as schema from "./db/schema.js";
import { sendAuthEmail } from "./services/email-service.js";
import { getRandomDiceBearFunEmojiAvatarUrl } from "./services/profile-avatar-service.js";

const trustedOrigins = [
  env.BETTER_AUTH_URL,
  ...(env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin.trim())
  .filter(Boolean);

const database =
  env.AUTH_STORAGE_MODE === "database"
    ? drizzleAdapter(db, {
        provider: "pg",
        schema,
      })
    : undefined;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  ...(database ? { database } : {}),
  user: {
    ...(env.AUTH_STORAGE_MODE === "database" ? { modelName: "users" } : {}),
    additionalFields: {
      onboardingCompleted: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: true,
      },
      country: {
        type: "string",
        required: false,
        defaultValue: "NP",
        input: true,
      },
      currency: {
        type: "string",
        required: false,
        defaultValue: "NPR",
        input: true,
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "Asia/Kathmandu",
        input: true,
      },
      userProfile: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          return {
            data: {
              ...user,
              userProfile:
                typeof user.userProfile === "string" && user.userProfile
                  ? user.userProfile
                  : getRandomDiceBearFunEmojiAvatarUrl(),
            },
          };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  plugins: [
    emailOTP({
      expiresIn: 300,
      allowedAttempts: 5,
      generateOTP: () => env.AUTH_OTP_BYPASS_CODE,
      async sendVerificationOTP({ email, otp, type }) {
        const purpose =
          type === "sign-in"
            ? "sign in"
            : type === "email-verification"
              ? "verify your email"
              : type === "change-email"
                ? "change your email"
                : "reset your password";

        await sendAuthEmail({
          to: email,
          subject: `Your Cocomama ${purpose} code`,
          text: `Use ${otp} to ${purpose} to Cocomama. This code expires in 5 minutes.`,
          html: `<p>Use <strong>${otp}</strong> to ${purpose} to Cocomama.</p><p>This code expires in 5 minutes.</p>`,
        });
      },
    }),
    magicLink({
      expiresIn: 300,
      async sendMagicLink({ email, url }) {
        await sendAuthEmail({
          to: email,
          subject: "Your Cocomama sign-in link",
          text: `Open this link to sign in to Cocomama: ${url}\n\nThis link expires in 5 minutes.`,
          html: `<p>Open this link to sign in to Cocomama:</p><p><a href="${url}">Sign in to Cocomama</a></p><p>This link expires in 5 minutes.</p>`,
        });
      },
    }),
  ],
});

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;
