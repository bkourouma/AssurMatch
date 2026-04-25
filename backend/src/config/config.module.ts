export interface AppConfig {
  appEnv: "local" | "test" | "staging" | "production";
  databaseUrl: string;
  redisUrl: string;
  httpsRequired: boolean;
  publicComparatorEnabled: boolean;
  quoteRequestEnabled: boolean;
  whatsappEnabled: boolean;
}

export class ConfigModule {
  readonly config: AppConfig;

  constructor(env: Record<string, string | undefined> = {}) {
    const appEnv = (env.APP_ENV ?? env.NODE_ENV ?? "local") as AppConfig["appEnv"];
    this.config = {
      appEnv,
      databaseUrl: env.DATABASE_URL ?? "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
      httpsRequired: appEnv !== "local" && appEnv !== "test",
      publicComparatorEnabled: env.PUBLIC_COMPARATOR_ENABLED === "true",
      quoteRequestEnabled: env.QUOTE_REQUEST_ENABLED === "true",
      whatsappEnabled: env.WHATSAPP_ENABLED === "true"
    };
  }
}
