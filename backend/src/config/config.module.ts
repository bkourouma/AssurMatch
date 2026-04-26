export interface AppConfig {
  appEnv: "local" | "test" | "runtime-smoke" | "staging" | "production";
  databaseUrl: string;
  redisUrl: string;
  queueNamespace: string;
  prismaMemory: boolean;
  redisMemory: boolean;
  queueMemory: boolean;
  httpsRequired: boolean;
  publicComparatorEnabled: boolean;
  quoteRequestEnabled: boolean;
  whatsappEnabled: boolean;
}

const runtimeEnvironments = new Set(["local", "runtime-smoke", "staging", "production"]);

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
  if ((appEnv === "staging" || appEnv === "production") && !env.REDIS_URL) {
    throw new Error("REDIS_URL is required for Redis and BullMQ runtime outside local/test");
  }
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
      prismaMemory: bool(env.ASSURMATCH_PRISMA_MEMORY),
      redisMemory: bool(env.ASSURMATCH_REDIS_MEMORY),
      queueMemory: bool(env.ASSURMATCH_QUEUE_MEMORY),
      httpsRequired: appEnv !== "local" && appEnv !== "test" && appEnv !== "runtime-smoke",
      publicComparatorEnabled: env.PUBLIC_COMPARATOR_ENABLED === "true",
      quoteRequestEnabled: env.QUOTE_REQUEST_ENABLED === "true",
      whatsappEnabled: env.WHATSAPP_ENABLED === "true"
    };
  }
}
