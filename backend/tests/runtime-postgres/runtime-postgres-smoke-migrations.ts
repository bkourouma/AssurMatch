import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { sanitizedDatabaseTarget } from "./runtime-postgres-smoke-env";

export async function validateAndApplyRuntimeSmokeMigrations(databaseUrl: string): Promise<void> {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  runPrisma(["validate", "--schema", "backend/prisma/schema.prisma"], env, "Prisma schema validation");
  await assertRuntimeSmokePostgresReachable(databaseUrl);
  runPrisma(["migrate", "deploy", "--schema", "backend/prisma/schema.prisma"], env, `Prisma migrations for ${sanitizedDatabaseTarget(databaseUrl)}`);
  runPrisma(["generate", "--schema", "backend/prisma/schema.prisma"], env, "Prisma client generation");
}

function runPrisma(args: string[], env: NodeJS.ProcessEnv, label: string): void {
  try {
    const command = `npx prisma ${args.join(" ")}`;
    execFileSync(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "sh", process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command], {
      cwd: process.cwd(),
      env,
      stdio: "inherit"
    });
  } catch (error) {
    throw new Error(`${label} failed; runtime PostgreSQL smoke tests cannot continue`, { cause: error });
  }
}

async function assertRuntimeSmokePostgresReachable(databaseUrl: string): Promise<void> {
  const target = sanitizedDatabaseTarget(databaseUrl);
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || "5432");
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await connectOnce(host, port);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const detail = formatConnectionError(lastError);
  throw new Error(
    `Runtime smoke PostgreSQL is not reachable at ${target}. ` +
      "Start it with `npm run test:runtime:postgres:up`, or run `npm run test:runtime:postgres:docker` to manage Docker automatically. " +
      `Last connection error: ${detail}`
  );
}

function connectOnce(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`connection to ${host}:${port} timed out`));
    });
    socket.once("error", reject);
  });
}

function formatConnectionError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.map(formatConnectionError).filter(Boolean).join("; ");
    return details || error.message || "aggregate connection failure";
  }
  if (error instanceof Error) {
    const code = "code" in error && typeof (error as NodeJS.ErrnoException).code === "string" ? ` (${(error as NodeJS.ErrnoException).code})` : "";
    return `${error.message || error.name}${code}`;
  }
  return String(error ?? "unknown connection error");
}
