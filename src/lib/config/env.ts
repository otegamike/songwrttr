import "server-only";
import { z } from "zod";
import { APP_NAME_DEFAULT } from "./constants";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "TOKEN_ENCRYPTION_KEY is required")
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes",
    ),
  ADMIN_EMAIL: z
    .string()
    .email("ADMIN_EMAIL must be an email address")
    .transform((value) => value.trim().toLowerCase()),
  APP_NAME: z.string().min(1).default(APP_NAME_DEFAULT),
  MAX_INSTRUMENTAL_MB: z.coerce.number().int().positive().default(50),
  MAX_TAKE_MB: z.coerce.number().int().positive().default(100),
  MAX_SONGS_PER_USER: z.coerce.number().int().positive().default(500),
  MAX_TAKES_PER_SONG: z.coerce.number().int().positive().default(50),
  MAX_AUDIO_BYTES_PER_USER: z.coerce.number().int().positive().default(5 * 1024 * 1024 * 1024),
  SONG_CREATES_PER_MINUTE: z.coerce.number().int().positive().default(10),
  UPLOAD_SESSIONS_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

function readRawEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NEXTAUTH_SECRET:
      process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL,
  };
}

export function getEnv(): AppEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(readRawEnv());
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function __resetEnvForTests(): void {
  cached = null;
}
