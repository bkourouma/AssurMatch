import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { QuoteAISummaryService } from "../../../src/modules/ai/quote-summary/quote-ai-summary.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("AI quote summary enabled", () => {
  it("queues an assistance-only summary and records approved guardrails", async () => {
    const now = new Date();
    const config = { id: crypto.randomUUID(), key: "quote_summary", status: "enabled" as const, guardrailStatus: "approved" as const, auditPolicy: "metadata_only" as const, modelCallCount: 0, createdAt: now, updatedAt: now };
    const queue = new InMemoryQueue();
    const service = new QuoteAISummaryService(queue, new AuditLogWriter(), config, {
      globalFlags: { ai_summary_enabled: true },
      countryFlags: { country_ai_enabled: true },
      productFlags: { product_ai_form_assistant_enabled: true }
    });
    const quote: QuoteRequestRecord = {
      id: crypto.randomUUID(),
      publicReference: "QR-2026-AI",
      verificationTokenHash: "hash",
      countryId: crypto.randomUUID(),
      countryCode: "CI",
      productId: crypto.randomUUID(),
      productKey: "auto",
      quoteFormDefinitionId: crypto.randomUUID(),
      prospectId: crypto.randomUUID(),
      consentRecordId: crypto.randomUUID(),
      source: "public_web",
      payload: {},
      status: "routed",
      duplicateStatus: "unique",
      routingStatus: "assigned",
      retentionUntil: now,
      createdAt: now,
      updatedAt: now
    };

    const summary = await service.enqueueIfAllowed(quote, superAdminActor);
    expect(summary?.summaryReference).toContain("Assistance:");
    expect(summary?.guardrailResult).toBe("approved");
    expect(queue.list()[0]?.jobType).toBe("ai_quote_summary");
  });
});
