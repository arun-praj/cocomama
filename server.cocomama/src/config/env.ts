import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const booleanFromEnv = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  return ["true", "1", "yes"].includes(value.toLowerCase());
};

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/cocomama"),
  BETTER_AUTH_SECRET: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .min(32)
      .default("development-only-cocomama-auth-secret-change-me"),
  ),
  BETTER_AUTH_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default("http://localhost:3001"),
  ),
  BETTER_AUTH_TRUSTED_ORIGINS: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  AUTH_EMAIL_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["console", "email"]).default("console"),
  ),
  AUTH_STORAGE_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["database"]).default("database"),
  ),
  AUTH_OTP_BYPASS_CODE: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .regex(/^\d{6}$/)
      .default("111111"),
  ),
  SMTP_PROVIDER: z.preprocess(
    emptyStringToUndefined,
    z.enum(["custom", "gmail"]).default("custom"),
  ),
  SMTP_HOST: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(587),
  ),
  SMTP_SECURE: z.preprocess(booleanFromEnv, z.boolean().default(false)),
  SMTP_USER: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(
    emptyStringToUndefined,
    z.string().default("Cocomama <no-reply@localhost>"),
  ),
  LLM_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default("https://integrate.api.nvidia.com/v1"),
  ),
  LLM_API_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  LLM_MODEL: z.string().default("nvidia/nemotron-3-ultra-550b-a55b"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(1),
  LLM_TOP_P: z.coerce.number().min(0).max(1).default(0.95),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  LLM_ENABLE_THINKING: z.preprocess(booleanFromEnv, z.boolean().default(true)),
  LLM_REASONING_BUDGET: z.coerce.number().int().positive().default(2048),
  LLM_PROVIDER_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(3).default(1),
  VOICE_GATEWAY_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default("http://localhost:8010"),
  ),
  VOICE_GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  VOICE_MAX_AUDIO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024),
  VOICE_TTS_DEFAULT_VOICE: z.preprocess(
    emptyStringToUndefined,
    z.string().default("af_sky"),
  ),
  IDEMPOTENCY_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(6),
});

export const env = envSchema.parse(process.env);

export type AppEnv = typeof env;
