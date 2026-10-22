// Lot 8 (spec 075 FR-A4, FR-A5): encrypts, re-encrypts (rotation) or decrypts (rollback) the personal
// data columns at rest: Prospect.emailNormalized / phoneNormalized (+ blind indexes) and
// QuoteRequest.payload. Runbook: docs/runbooks/pii-encryption.md.
//
//   node --import tsx scripts/ops/backfill-pii-encryption.ts            # dry-run: counts only
//   node --import tsx scripts/ops/backfill-pii-encryption.ts --apply    # writes
//   ... --decrypt --apply        rollback to clear values (every key of the ring must still be present)
//   ... --reindex --apply        also recompute the blind indexes of rows already on the active key
//   ... --batch 200              page size (1..1000)
//   ... --only prospect|quote-request [--after <id>]   one table, resuming behind a reported id
//
// In a container:
//   docker compose -f docker-compose.production.yml run --rm api \
//     node --import tsx scripts/ops/backfill-pii-encryption.ts [--apply]
//
// Dry-run by default, idempotent (a second pass finds nothing to do), resumable, never logs a value,
// an envelope or a key: the output is counts, the active key id and the ids of rows that failed.
// Exit codes: 0 done, 2 some rows could not be processed (see failures), 64 usage, 1 failure.

import { parseArgs } from "node:util";
import { PrismaService } from "../../backend/src/modules/common/prisma/prisma.service";
import { PiiBackfillUsageError, runPiiBackfill, type PiiBackfillClient, type PiiBackfillTable } from "../../backend/src/modules/common/security/pii-backfill";
import { PiiVault } from "../../backend/src/modules/common/security/pii-vault";

const usage = "Usage: node --import tsx scripts/ops/backfill-pii-encryption.ts [--apply] [--decrypt] [--reindex] [--batch 200] [--only prospect|quote-request] [--after <id>]";

let values: { apply?: boolean; decrypt?: boolean; reindex?: boolean; batch?: string; only?: string; after?: string; help?: boolean };
try {
  ({ values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      decrypt: { type: "boolean", default: false },
      reindex: { type: "boolean", default: false },
      batch: { type: "string" },
      only: { type: "string" },
      after: { type: "string" },
      help: { type: "boolean", default: false }
    },
    strict: true
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exit(64);
}

if (values.help) {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

const onlyTables: Record<string, PiiBackfillTable> = { prospect: "prospect", "quote-request": "quoteRequest" };
const only = values.only === undefined ? undefined : onlyTables[values.only];
const batchSize = values.batch === undefined ? undefined : Number(values.batch);
if ((values.only !== undefined && !only) || (values.after !== undefined && !only) || (batchSize !== undefined && !Number.isInteger(batchSize))) {
  console.error(usage);
  process.exit(64);
}

const prisma = new PrismaService();
if (prisma.runtimeMode !== "prisma-client") {
  console.error("Refused: the backfill runs against a real database only (DATABASE_URL, no memory adapters, not NODE_ENV=test).");
  process.exit(1);
}

let exitCode = 0;
try {
  // Validates the runtime environment (PII keys included) before connecting.
  await prisma.onModuleInit();
  const vault = PiiVault.fromEnv(process.env);
  const client = prisma.requireRuntimeClient() as unknown as PiiBackfillClient;
  const report = await runPiiBackfill(client, vault, {
    apply: Boolean(values.apply),
    direction: values.decrypt ? "decrypt" : "encrypt",
    reindex: Boolean(values.reindex),
    batchSize,
    ...(only ? { tables: [only] } : {}),
    after: values.after,
    onBatch: ({ table, scanned, lastId }) => process.stdout.write(`[pii-backfill] ${table}: ${scanned} scanned, last id ${lastId}\n`)
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.apply) process.stdout.write("[pii-backfill] dry-run: nothing was written (add --apply).\n");
  if (report.tables.some((table) => table.failed > 0)) exitCode = 2;
} catch (error) {
  if (error instanceof PiiBackfillUsageError) {
    console.error(`Refused: ${error.message}`);
    exitCode = 64;
  } else {
    // The error name and message of the vault never carry a value; other errors are printed by name only.
    console.error(`Failed: ${error instanceof Error ? `${error.name}: ${error.name === "PiiConfigurationError" || error.name === "PiiCryptoError" ? error.message : "see the database logs"}` : "unknown error"}`);
    exitCode = 1;
  }
} finally {
  await prisma.onModuleDestroy().catch(() => undefined);
}
process.exit(exitCode);
