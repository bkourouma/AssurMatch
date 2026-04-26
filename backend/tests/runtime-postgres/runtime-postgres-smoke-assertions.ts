import assert from "node:assert/strict";
import type { RuntimeSmokeRun } from "./runtime-postgres-smoke-data";
import type { RuntimeSmokePrismaClient } from "./runtime-postgres-smoke-prisma";

const REQUIRED_REPOSITORIES = [
  "AuditLogRepository",
  "FeatureFlagRepository",
  "CountriesRepository",
  "ProductsRepository",
  "OffersRepository",
  "ProspectsRepository",
  "ConsentRecordsRepository",
  "QuoteRequestsRepository",
  "LeadAssignmentsRepository",
  "RoutingDecisionsRepository",
  "PartnersRepository",
  "PartnerLicensesRepository",
  "CrmActivityRepository",
  "NotificationsRepository"
];

export function assertPrismaRuntimeRepositories(modes: Record<string, string | undefined>): void {
  for (const repositoryName of REQUIRED_REPOSITORIES) {
    assert.equal(modes[repositoryName], "prisma-runtime", `${repositoryName} must resolve to prisma-runtime`);
  }
}

export async function assertSensitiveFlagsFailClosed(prisma: RuntimeSmokePrismaClient): Promise<void> {
  const prohibitedFlags = [
    "payments_enabled",
    "e_signature_enabled",
    "policy_issuance_enabled",
    "claims_enabled",
    "insurer_api_enabled",
    "ai_lead_scoring_enabled",
    "ai_summary_enabled",
    "ai_duplicate_detection_enabled",
    "ai_recommendation_enabled",
    "ai_broker_assistant_enabled"
  ];
  const flags = await prisma.featureFlag.findMany({ where: { key: { in: prohibitedFlags }, value: true } });
  assert.equal(flags.length, 0, `Sensitive flags must remain fail-closed: ${flags.map((flag) => flag.key).join(", ")}`);
}

export async function assertAuditExists(prisma: RuntimeSmokePrismaClient, run: RuntimeSmokeRun): Promise<void> {
  const audit = await prisma.auditLog.findFirst({ where: { correlationId: run.correlationId } });
  assert.ok(audit, "Expected durable AuditLog for runtime smoke correlation id");
}
