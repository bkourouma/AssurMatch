import { describe, expect, it } from "vitest";
import { reasonCarriesContact, retentionPreviewRequestSchema } from "../../../../packages/shared/contracts/data-retention.contracts";
import { DataRetentionAuditActions, RetentionBatchConflictError } from "../../../src/modules/data-retention/data-retention.module";
import { MemoryDataRetentionRepository, type AnonymizationBatchRecord } from "../../../src/modules/data-retention/data-retention.repository";
import { RETENTION_SCAN_PAGE_SIZE, RetentionEligibilityService } from "../../../src/modules/data-retention/retention-eligibility.service";
import type { RetentionCandidatePage, RetentionCandidateQuery, RetentionSubjectsRepository } from "../../../src/modules/data-retention/retention-subjects.repository";
import { compliance, createRetentionWorld, daysAgo, NOW, TENANT_A } from "./retention-world";

const reason = "Revue trimestrielle de conservation";

/**
 * An adapter that, like the Prisma quote_documents query of a country-scoped preview, filters rows
 * after reading a full page: the first pages are read (`scanned` = page size) but keep nothing.
 */
function filteringAfterPage(totalRows: number, eligibleFrom: number): RetentionSubjectsRepository {
  const listCandidates = async (_category: string, query: RetentionCandidateQuery): Promise<RetentionCandidatePage> => {
    const rows = Array.from({ length: Math.max(0, Math.min(query.take, totalRows - query.skip)) }, (_, index) => query.skip + index);
    return {
      candidates: rows.filter((row) => row >= eligibleFrom).map((row) => ({ id: `doc-${row}`, countryId: "ci", anchor: daysAgo(400), expired: false })),
      scanned: rows.length
    };
  };
  return { mode: "memory-test", listCandidates } as unknown as RetentionSubjectsRepository;
}

describe("data retention security review fixes", () => {
  it("M1: keeps scanning while pages are full even when the adapter filtered them empty", async () => {
    const eligibility = new RetentionEligibilityService(filteringAfterPage(RETENTION_SCAN_PAGE_SIZE * 2 + 3, RETENTION_SCAN_PAGE_SIZE * 2));
    const result = await eligibility.compute({ categories: ["quote_documents"], countryId: "ci", policies: [], now: NOW, cap: 2 });
    expect(result.targets.quote_documents).toEqual([`doc-${RETENTION_SCAN_PAGE_SIZE * 2}`, `doc-${RETENTION_SCAN_PAGE_SIZE * 2 + 1}`]);
    expect(result.counts.quote_documents).toEqual({ selected: 2, moreRemaining: true });
  });

  it("M2: an execution that fails after the claim ends interrupted, with the counts done so far, and cannot be re-approved", async () => {
    const world = createRetentionWorld();
    await world.addQuote({ prospect: world.addProspect("ama@example.test"), ageDays: 800 });
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    const execute = world.module.anonymization.execute.bind(world.module.anonymization);
    world.module.anonymization.execute = async (batch, eligible, actor, now, counts = {}) => {
      await execute(batch, eligible, actor, now, counts);
      throw new Error("database connection lost");
    };

    const result = await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    expect(result.status).toBe("interrupted");
    expect(result.counts).toEqual([{ subject: "quote_requests", selected: 1, anonymized: 1, skipped: 0, failed: 0, moreRemaining: false }]);
    expect((await world.module.repository.findBatch(preview.id))?.status).toBe("interrupted");
    expect(world.audit.search({ action: DataRetentionAuditActions.batchExecuted })[0]).toMatchObject({ result: "failed", reason: "batch_interrupted" });
    await expect(world.service.approve(preview.id, { reason: "Validation conformite" }, compliance)).rejects.toBeInstanceOf(RetentionBatchConflictError);
  });

  it("M2: a failing re-check leaves the batch previewed and approvable, and a claimed batch never reads previewed or expired", async () => {
    const world = createRetentionWorld();
    await world.addQuote({ prospect: world.addProspect("ama@example.test"), ageDays: 800 });
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    const stillEligible = world.module.eligibility.stillEligible.bind(world.module.eligibility);
    world.module.eligibility.stillEligible = async () => {
      throw new Error("timeout");
    };
    await expect(world.service.approve(preview.id, { reason: "Validation conformite" }, compliance)).rejects.toThrow(/timeout/);
    expect((await world.service.getBatch(preview.id, compliance)).status).toBe("previewed");
    world.module.eligibility.stillEligible = stillEligible;
    expect((await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance)).status).toBe("executed");

    // A batch claimed by an approval that crashed before any status write.
    const crashed = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    expect(await world.module.repository.claimForApproval(crashed.id, "compliance-1", "Validation conformite", NOW)).toBe(true);
    world.clock.now = new Date(NOW.getTime() + 48 * 60 * 60 * 1000);
    expect((await world.service.getBatch(crashed.id, compliance)).status).toBe("interrupted");
  });

  it("M3: skips an orphan prospect of an erasure batch that received a request after the preview", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    world.enablePurge();
    const preview = await world.service.previewErasure({ email: "ama@example.test", reason: "Demande d'effacement par courrier" }, compliance);
    expect(preview.counts.find((count) => count.subject === "prospects")?.selected).toBe(1);

    const { quote } = await world.addQuote({ prospect, ageDays: 1 });
    const executed = await world.service.approve(preview.id, { reason: "Effacement valide" }, compliance);

    expect(executed.counts.find((count) => count.subject === "prospects")).toMatchObject({ selected: 1, anonymized: 0, skipped: 1 });
    expect(prospect.emailNormalized).toBe("ama@example.test");
    expect(quote.anonymizedAt).toBeUndefined();
  });

  it("L1: the expired and refused writes never overwrite a claimed batch", async () => {
    const repository = new MemoryDataRetentionRepository();
    const batch: AnonymizationBatchRecord = {
      id: crypto.randomUUID(), kind: "retention", status: "previewed", countryId: null, categories: ["quote_requests"], erasureLookup: null,
      reason, requestedById: "compliance-1", approvedById: null, approvalReason: null, targets: {}, counts: {},
      previewExpiresAt: NOW, approvedAt: null, executedAt: null, createdAt: NOW, updatedAt: NOW
    };
    await repository.createBatch(batch);
    expect(await repository.claimForApproval(batch.id, "compliance-1", "Validation conformite", NOW)).toBe(true);
    expect(await repository.transitionFromPreview(batch.id, { status: "expired" })).toBe(false);
    expect(await repository.transitionFromPreview(batch.id, { status: "refused" })).toBe(false);
    expect((await repository.findBatch(batch.id))?.status).toBe("previewed");
  });

  it("L3: refuses a reason carrying a phone number, but not an ISO date", () => {
    expect(reasonCarriesContact("Rappeler le +225 01 02 03 04 05")).toBe(true);
    expect(reasonCarriesContact("Demande recue du 0102030405")).toBe(true);
    expect(reasonCarriesContact("Tel 07.08.09.10.11")).toBe(true);
    expect(reasonCarriesContact("Demande recue le 2026-09-24, dossier 1234")).toBe(false);
    expect(retentionPreviewRequestSchema.safeParse({ reason: "Appel du 01-02-03-04-05" }).success).toBe(false);
    expect(retentionPreviewRequestSchema.safeParse({ reason: "Revue du 2026-09-24" }).success).toBe(true);
  });

  it("L4 and L6: selects final messaging deliveries only, and clears pipeline reasons and lead tags", async () => {
    const world = createRetentionWorld();
    const { assignments } = await world.addQuote({ prospect: world.addProspect("ama@example.test"), ageDays: 800, tenants: [TENANT_A] });
    world.data.deliveries.push(
      { id: crypto.randomUUID(), channel: "sms", status: "sent", template: "t", recipientMasked: "+225******05", provider: "none", partnerTenantId: null, scopeId: "s", reason: null, correlationId: null, createdAt: daysAgo(100) },
      { id: crypto.randomUUID(), channel: "sms", status: "pending" as "sent", template: "t", recipientMasked: "+225******06", provider: "none", partnerTenantId: null, scopeId: "s", reason: null, correlationId: null, createdAt: daysAgo(100) }
    );
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests", "messaging_references"], reason }, compliance);
    expect(preview.counts.find((count) => count.subject === "messaging_references")?.selected).toBe(1);
    await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    const assignment = assignments[0];
    expect(assignment?.tags).toEqual([]);
    const history = await world.crm.pipelineHistoryForLead(assignment?.id ?? "");
    expect(history[0]).toMatchObject({ eventType: "status_changed", nextStatus: "perdu" });
    expect(history[0]?.reason).toBeUndefined();
    expect(world.data.deliveries.map((delivery) => delivery.recipientMasked)).toEqual(["[anonymise]", "+225******06"]);
  });
});
