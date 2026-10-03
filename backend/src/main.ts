import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AssurMatchRuntime } from "./runtime/assurmatch-runtime";
import { corsAllowedOrigins } from "./config/config.module";
import { ErrorResponseFilter } from "./modules/common/filters/error-response.filter";
import { applyObservability, installProcessErrorHandlers, JsonNestLogger } from "./modules/observability/observability";
import { errorReporter } from "./modules/observability/error-reporter";
import { logEvent } from "./modules/observability/structured-logger";

/**
 * Spec 043: the public app submits quote requests from the visitor's browser, so a cross-origin
 * preflight has to be answered. The allowlist is explicit and credentials stay off, because the
 * public endpoints are token-free and nothing should be sent with a cookie attached.
 */
function applyCors(app: INestApplication): void {
  const origins = corsAllowedOrigins();
  if (origins.length === 0) return;
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-correlation-id"],
    credentials: false,
    maxAge: 600
  });
}

export async function createAssurMatchApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  applyObservability(app);
  applyCors(app);
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  return app;
}

/**
 * Spec 059 follow-up: the API re-reads the feature flags from the database on a fixed interval
 * (`ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS`, 30 by default, 0 = never), like the worker does before
 * every cycle. A sensitive flag can only be changed outside the API (compliance policy script,
 * `scripts/ops/apply-flag-policy.ts`); without this the running API kept the old value until a
 * restart. Admin toggles made through this API are applied at once, as before.
 */
export function featureFlagRefreshSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env.ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS?.trim();
  if (!raw) return 30;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 3600 ? value : 30;
}

function scheduleFeatureFlagRefresh(app: INestApplication): void {
  const seconds = featureFlagRefreshSeconds();
  if (seconds === 0) return;
  const runtime = app.get(AssurMatchRuntime);
  const timer = setInterval(() => {
    runtime.reloadRuntimeFeatureFlags().catch((error: unknown) => logEvent("warn", "feature_flags.refresh_failed", { error: error instanceof Error ? error.name : "Error" }));
  }, seconds * 1000);
  timer.unref();
}

export async function bootstrap(port = Number(process.env.PORT ?? 3000)): Promise<void> {
  installProcessErrorHandlers();
  const app = await NestFactory.create(AppModule, { logger: new JsonNestLogger() });
  applyObservability(app);
  applyCors(app);
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  await app.listen(port);
  scheduleFeatureFlagRefresh(app);
  logEvent("info", "api.started", { port, errorReporting: errorReporter().enabled ? "enabled" : "disabled", metrics: process.env.METRICS_TOKEN?.trim() ? "enabled" : "disabled" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrap();
}
