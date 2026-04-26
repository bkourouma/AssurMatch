import { execFileSync } from "node:child_process";
import { sanitizedDatabaseTarget } from "./runtime-postgres-smoke-env";

export function validateAndApplyRuntimeSmokeMigrations(databaseUrl: string): void {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  runPrisma(["validate", "--schema", "backend/prisma/schema.prisma"], env, "Prisma schema validation");
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
