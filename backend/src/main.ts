import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module";
import { corsAllowedOrigins } from "./config/config.module";
import { ErrorResponseFilter } from "./modules/common/filters/error-response.filter";

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
  applyCors(app);
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  return app;
}

export async function bootstrap(port = Number(process.env.PORT ?? 3000)): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  applyCors(app);
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  await app.listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrap();
}
