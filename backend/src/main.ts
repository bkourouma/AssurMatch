import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ErrorResponseFilter } from "./modules/common/filters/error-response.filter";

export async function createAssurMatchApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  return app;
}

export async function bootstrap(port = Number(process.env.PORT ?? 3000)): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  await app.listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrap();
}
