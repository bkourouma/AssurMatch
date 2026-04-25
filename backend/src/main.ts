import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export function createAssurMatchApp(): AppModule {
  return new AppModule();
}

export async function bootstrap(port = Number(process.env.PORT ?? 3000)): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.enableShutdownHooks();
  await app.listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrap();
}
