// Applies a compliance decision to a SENSITIVE global feature flag (spec 059 follow-up).
//
//   npm run ops:apply-flag-policy -- --flag satisfaction_survey_enabled --value true \
//     --reference "POL-2026-048" --approved-by "Nom Prenom, DPO" --reason "Ouverture enquete CI apres validation"
//
// In a container:
//   docker compose -f docker-compose.production.yml run --rm api \
//     node --import tsx scripts/ops/apply-flag-policy.ts --flag ... --value true --reference ... --approved-by ... --reason ...
//
// Sensitive flags have no admin toggle by design. This command is the audited path
// (`feature_flag.policy_applied`, with the policy reference and approver). The running API and
// worker pick the new value up on their next refresh (API: ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS,
// 30 s by default; worker: every cycle). Regulated modules (payments, e-signature, policy issuance,
// claims, insurer API) are refused. Exit codes: 0 applied, 2 refused, 64 usage, 1 failure.

import { parseArgs } from "node:util";
import { AssurMatchRuntime } from "../../backend/src/runtime/assurmatch-runtime";
import { applyFlagPolicy, FlagPolicyRefusedError } from "../../backend/src/runtime/ops/apply-flag-policy";

const usage = "Usage: npm run ops:apply-flag-policy -- --flag <key> --value true|false --reference <policy ref> --approved-by <name, role> --reason <text>";

let values: { flag?: string; value?: string; reference?: string; "approved-by"?: string; reason?: string; help?: boolean };
try {
  ({ values } = parseArgs({
    options: {
      flag: { type: "string" },
      value: { type: "string" },
      reference: { type: "string" },
      "approved-by": { type: "string" },
      reason: { type: "string" },
      help: { type: "boolean", default: false }
    },
    strict: true
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exit(64);
}

if (values.help || !values.flag || !["true", "false"].includes(values.value ?? "") || !values.reference || !values["approved-by"] || !values.reason) {
  console.error(usage);
  process.exit(values.help ? 0 : 64);
}

const runtime = new AssurMatchRuntime();
if (runtime.prisma.runtimeMode !== "prisma-client" && process.env.NODE_ENV !== "test") {
  console.error("Refused: the policy must be applied to the real database (DATABASE_URL, no memory adapters).");
  process.exit(1);
}

let exitCode = 0;
try {
  await runtime.onModuleInit();
  const { flag, previousValue } = await applyFlagPolicy(runtime.featureFlags.service, {
    flag: values.flag,
    value: values.value === "true",
    reference: values.reference,
    approvedBy: values["approved-by"],
    reason: values.reason
  });
  process.stdout.write(`Policy applied: ${flag.key} ${previousValue} -> ${flag.value} (reference ${values.reference}). Audited as feature_flag.policy_applied.\n`);
} catch (error) {
  if (error instanceof FlagPolicyRefusedError) {
    console.error(`Refused: ${error.reason}. Nothing was changed.`);
    exitCode = 2;
  } else {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  }
} finally {
  await runtime.onModuleDestroy().catch(() => undefined);
}
process.exit(exitCode);
