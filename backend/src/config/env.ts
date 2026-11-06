import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().transform((val) => parseInt(val, 10)).default("5000"),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("*"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().optional(),

  // JWT & Security
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  TOKEN_ROTATION_GRACE_SECONDS: z.string().transform((val) => parseInt(val, 10)).default("10"),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "TOKEN_ENCRYPTION_KEY must be at least 32 characters"),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ADMIN_CHAT_ID: z.string().transform((val) => BigInt(val)).default("5999909651"),
  TELEGRAM_GROUP_CHAT_ID: z.string().transform((val) => BigInt(val)).default("-1003847746028"),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Environment validation error:", JSON.stringify(result.error.format(), null, 2));
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

export const env = validateEnv();
