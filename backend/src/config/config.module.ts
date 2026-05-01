import type { EmailRuntimeConfig } from "../modules/notifications/email/email-config";
import { resolveEmailRuntimeConfig, validateEmailRuntimeEnvironment } from "../modules/notifications/email/email-config";

export interface AppConfig {
  appEnv: "local" | "test" | "runtime-smoke" | "staging" | "preproduction" | "production";
  databaseUrl: string;
  redisUrl: string;
  queueNamespace: string;
  encryptionKey?: string;
  authJwtTtlMinutes: number;
  authLockoutThreshold: number;
  authLockoutWindowMinutes: number;
  authLockoutCooldownMinutes: number;
  prismaMemory: boolean;
  redisMemory: boolean;
  queueMemory: boolean;
  httpsRequired: boolean;
  publicComparatorEnabled: boolean;
  quoteRequestEnabled: boolean;
  whatsappEnabled: boolean;
  email: EmailRuntimeConfig;
}

const runtimeEnvironments = new Set(["local", "runtime-smoke", "staging", "preproduction", "production"]);

export function isTestEnvironment(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NODE_ENV ?? env.APP_ENV) === "test";
}

export function isProductionLike(env: Record<string, string | undefined> = process.env): boolean {
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  return appEnv === "production" || env.NODE_ENV === "production";
}

function bool(value: string | undefined): boolean {
  return value === "true";
}

function positiveInt(env: Record<string, string | undefined>, key: string, defaultValue: number): number {
  const raw = env[key];
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
}

export function validateRuntimeEnvironment(env: Record<string, string | undefined> = process.env): void {
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  const test = isTestEnvironment(env);
  const memoryOverrides = [
    ["ASSURMATCH_PRISMA_MEMORY", env.ASSURMATCH_PRISMA_MEMORY],
    ["ASSURMATCH_REDIS_MEMORY", env.ASSURMATCH_REDIS_MEMORY],
    ["ASSURMATCH_QUEUE_MEMORY", env.ASSURMATCH_QUEUE_MEMORY],
    ["ASSURMATCH_AUDIT_MEMORY", env.ASSURMATCH_AUDIT_MEMORY]
  ].filter(([, value]) => bool(value));

  if (!test && memoryOverrides.length > 0) {
    throw new Error(`Memory runtime adapters are test-only: ${memoryOverrides.map(([key]) => key).join(", ")}`);
  }
  if (runtimeEnvironments.has(appEnv) && !env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required outside explicit test runtime");
  }
  if ((appEnv === "staging" || appEnv === "preproduction" || appEnv === "production") && !env.REDIS_URL) {
    throw new Error("REDIS_URL is required for Redis and BullMQ runtime outside local/test");
  }
  if ((appEnv === "preproduction" || appEnv === "production") && (!env.ENCRYPTION_KEY || Buffer.byteLength(env.ENCRYPTION_KEY, "utf8") < 32)) {
    throw new Error("ENCRYPTION_KEY of at least 32 bytes is required in preproduction and production");
  }
  positiveInt(env, "AUTH_JWT_TTL_MINUTES", 15);
  positiveInt(env, "AUTH_LOCKOUT_THRESHOLD", 5);
  positiveInt(env, "AUTH_LOCKOUT_WINDOW_MINUTES", 15);
  positiveInt(env, "AUTH_LOCKOUT_COOLDOWN_MINUTES", 30);
  validateEmailRuntimeEnvironment(env);
}

export class ConfigModule {
  readonly config: AppConfig;

  constructor(env: Record<string, string | undefined> = process.env) {
    validateRuntimeEnvironment(env);
    const appEnv = (env.APP_ENV ?? env.NODE_ENV ?? "local") as AppConfig["appEnv"];
    this.config = {
      appEnv,
      databaseUrl: env.DATABASE_URL ?? "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
      queueNamespace: env.BULLMQ_PREFIX ?? "assurmatch",
      ...(env.ENCRYPTION_KEY ? { encryptionKey: env.ENCRYPTION_KEY } : {}),
      authJwtTtlMinutes: positiveInt(env, "AUTH_JWT_TTL_MINUTES", 15),
      authLockoutThreshold: positiveInt(env, "AUTH_LOCKOUT_THRESHOLD", 5),
      authLockoutWindowMinutes: positiveInt(env, "AUTH_LOCKOUT_WINDOW_MINUTES", 15),
      authLockoutCooldownMinutes: positiveInt(env, "AUTH_LOCKOUT_COOLDOWN_MINUTES", 30),
      prismaMemory: bool(env.ASSURMATCH_PRISMA_MEMORY),
      redisMemory: bool(env.ASSURMATCH_REDIS_MEMORY),
      queueMemory: bool(env.ASSURMATCH_QUEUE_MEMORY),
      httpsRequired: appEnv !== "local" && appEnv !== "test" && appEnv !== "runtime-smoke",
      publicComparatorEnabled: env.PUBLIC_COMPARATOR_ENABLED === "true",
      quoteRequestEnabled: env.QUOTE_REQUEST_ENABLED === "true",
      whatsappEnabled: env.WHATSAPP_ENABLED === "true",
      email: resolveEmailRuntimeConfig(env)
    };
  }
}
