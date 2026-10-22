// Read-only check of the AuditLog HMAC signatures (spec 075 FR-B3, lot 8).
//
//   npm run ops:verify-audit -- [--from 2026-10-01T00:00:00Z] [--to 2026-10-31T23:59:59Z] [--limit 100000]
//
// Needs DATABASE_URL and the same AUDIT_INTEGRITY_KEYS ("keyId:base64,...") as the API (old key ids
// stay in the list so rows signed before a rotation still verify). It only SELECTs: it never
// writes, and it reports row ids only, never an action, a context or a PII value.
// Exit codes: 0 all signed rows valid, 2 at least one invalid signature, 64 usage, 1 failure.
// Rows without a signature are reported ("missing") but do not fail the run: they are the rows
// written before the key was configured; investigate when their number grows after that date.

import { parseArgs } from "node:util";
import { parseAuditIntegrityKeys, verifyAuditEntry, type AuditIntegrityKeyring } from "../../backend/src/modules/common/security/audit-integrity";

export interface AuditRowReader {
  auditLog: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: { id: "asc" };
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
}

export interface VerifyOptions {
  client: AuditRowReader;
  keyring: AuditIntegrityKeyring;
  from?: Date | undefined;
  to?: Date | undefined;
  limit?: number | undefined;
  batchSize?: number | undefined;
}

export interface VerifyReport {
  verified: number;
  ok: number;
  missingSignature: number;
  invalidSignature: number;
  /** Ids only, capped for display. */
  invalidIds: string[];
  missingIds: string[];
}

const MAX_LISTED_IDS = 200;

export async function verifyAuditIntegrity(options: VerifyOptions): Promise<VerifyReport> {
  const batchSize = options.batchSize ?? 500;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const report: VerifyReport = { verified: 0, ok: 0, missingSignature: 0, invalidSignature: 0, invalidIds: [], missingIds: [] };
  let lastId: string | undefined;
  while (report.verified < limit) {
    const occurredAt = {
      ...(options.from ? { gte: options.from } : {}),
      ...(options.to ? { lte: options.to } : {})
    };
    const where: Record<string, unknown> = {
      ...(lastId ? { id: { gt: lastId } } : {}),
      ...(Object.keys(occurredAt).length > 0 ? { occurredAt } : {})
    };
    const rows = await options.client.auditLog.findMany({ where, orderBy: { id: "asc" }, take: Math.min(batchSize, limit - report.verified) });
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = String(row.id);
      const outcome = verifyAuditEntry(
        {
          id,
          actorId: (row.actorId as string | null | undefined) ?? null,
          action: String(row.action),
          targetType: String(row.targetType),
          targetId: String(row.targetId),
          scope: (row.scope as Record<string, unknown> | null) ?? {},
          result: row.result as "success" | "failed" | "refused",
          reason: (row.reason as string | null | undefined) ?? null,
          context: (row.context as Record<string, unknown> | null) ?? {},
          correlationId: (row.correlationId as string | null | undefined) ?? null,
          occurredAt: row.occurredAt as Date | string,
          retentionUntil: row.retentionUntil as Date | string
        },
        { integrityHash: row.integrityHash as string | null | undefined, integrityKeyId: row.integrityKeyId as string | null | undefined },
        options.keyring
      );
      report.verified += 1;
      if (outcome === "ok") report.ok += 1;
      else if (outcome === "missing") {
        report.missingSignature += 1;
        if (report.missingIds.length < MAX_LISTED_IDS) report.missingIds.push(id);
      } else {
        report.invalidSignature += 1;
        if (report.invalidIds.length < MAX_LISTED_IDS) report.invalidIds.push(id);
      }
    }
    lastId = String(rows[rows.length - 1]?.id);
    if (rows.length < batchSize) break;
  }
  return report;
}

export function exitCodeFor(report: VerifyReport): number {
  return report.invalidSignature > 0 ? 2 : 0;
}

function parseDate(label: string, value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`--${label} must be an ISO date`);
  return date;
}

async function main(): Promise<number> {
  const usage = "Usage: npm run ops:verify-audit -- [--from ISO] [--to ISO] [--limit N]";
  let values: { from?: string; to?: string; limit?: string; help?: boolean };
  try {
    ({ values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, limit: { type: "string" }, help: { type: "boolean", default: false } }, strict: true }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    return 64;
  }
  if (values.help) {
    process.stdout.write(`${usage}
`);
    return 0;
  }
  let from: Date | undefined;
  let to: Date | undefined;
  let limit: number | undefined;
  try {
    from = parseDate("from", values.from);
    to = parseDate("to", values.to);
    if (values.limit !== undefined) {
      limit = Number(values.limit);
      if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit must be a positive integer");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    return 64;
  }
  const keyring = parseAuditIntegrityKeys();
  if (keyring.size === 0) {
    console.error("AUDIT_INTEGRITY_KEYS is empty: nothing can be verified.");
    return 1;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    return 1;
  }
  const adapterModule = (await import("@prisma/adapter-pg")) as unknown as { PrismaPg: new (url: string) => unknown };
  const prismaModule = (await import("@prisma/client")) as unknown as { PrismaClient: new (input: unknown) => AuditRowReader & { $disconnect(): Promise<void> } };
  const client = new prismaModule.PrismaClient({ adapter: new adapterModule.PrismaPg(process.env.DATABASE_URL) });
  try {
    const report = await verifyAuditIntegrity({ client, keyring, from, to, limit });
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return exitCodeFor(report);
  } finally {
    await client.$disconnect();
  }
}

// Runs only when invoked as a script, so the tests can import the functions above.
if (process.argv[1] && /verify-audit-integrity\.[cm]?[jt]s$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.name : "failure");
    process.exit(1);
  });
}
