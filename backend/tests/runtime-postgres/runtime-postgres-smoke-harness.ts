import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { AppModule } from "../../src/app.module";
import { ErrorResponseFilter } from "../../src/modules/common/filters/error-response.filter";
import { AssurMatchRuntime } from "../../src/runtime/assurmatch-runtime";
import { createRuntimeSmokePrismaClient, type RuntimeSmokePrismaClient } from "./runtime-postgres-smoke-prisma";

export interface RuntimePostgresSmokeHarness {
  app: INestApplication;
  runtime: AssurMatchRuntime;
  prisma: RuntimeSmokePrismaClient;
  baseUrl: string;
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export async function createRuntimePostgresSmokeHarness(databaseUrl: string): Promise<RuntimePostgresSmokeHarness> {
  const prisma = await createRuntimeSmokePrismaClient(databaseUrl);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ErrorResponseFilter());
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    app,
    runtime: app.get(AssurMatchRuntime),
    prisma,
    baseUrl,
    request(path, init) {
      return fetch(`${baseUrl}${path}`, init);
    },
    async close() {
      await app.close();
      await prisma.$disconnect();
    }
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
