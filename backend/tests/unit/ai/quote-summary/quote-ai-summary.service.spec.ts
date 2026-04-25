import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../../src/modules/common/queues/queues.module";
import { QuoteAISummaryService } from "../../../../src/modules/ai/quote-summary/quote-ai-summary.service";
import type { QuoteRequestRecord } from "../../../../src/modules/quote-requests/quote-submission.service";
import { superAdminActor } from "../../../integration/helpers/enterprise-seed";

function quote(): QuoteRequestRecord {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    publicReference: "QR-2026-TEST",
    verificationTokenHash: "hash",
    countryId: crypto.randomUUID(),
    countryCode: "CI",
    productId: crypto.randomUUID(),
    productKey: "auto",
    quoteFormDefinitionId: crypto.randomUUID(),
    prospectId: crypto.randomUUID(),
    consentRecordId: crypto.randomUUID(),
    source: "public_web",
    payload: { vehicle_use: "prive" },
    status: "routed",
    duplicateStatus: "unique",
    routingStatus: "assigned",
    retentionUntil: now,
    createdAt: now,
    updatedAt: now
  };
}

describe("QuoteAISummaryService", () => {
  it("skips disabled AI without model calls and queues minimized enabled summaries", async () => {
    const disabledConfig = { id: crypto.randomUUID(), key: "quote_summary", status: "disabled" as const, guardrailStatus: "approved" as const, auditPolicy: "metadata_only" as const, modelCallCount: 0, createdAt: new Date(), updatedAt: new Date() };
    const disabled = new QuoteAISummaryService(new InMemoryQueue(), new AuditLogWriter(), disabledConfig, {
      globalFlags: { ai_summary_enabled: false },
      countryFlags: { country_ai_enabled: true },
      productFlags: { product_ai_form_assistant_enabled: true }
    });

    expect(await disabled.enqueueIfAllowed(quote(), superAdminActor)).toBeUndefined();
    expect(disabledConfig.modelCallCount).toBe(0);

    const enabledConfig = { ...disabledConfig, status: "enabled" as const, modelCallCount: 0 };
    const queue = new InMemoryQueue();
    const enabled = new QuoteAISummaryService(queue, new AuditLogWriter(), enabledConfig, {
      globalFlags: { ai_summary_enabled: true },
      countryFlags: { country_ai_enabled: true },
      productFlags: { product_ai_form_assistant_enabled: true }
    });

    const summary = await enabled.enqueueIfAllowed(quote(), superAdminActor);
    expect(summary?.visibleToBroker).toBe(true);
    expect(enabledConfig.modelCallCount).toBe(1);
    expect(queue.list()[0]?.payloadReference).toMatch(/^[0-9a-f-]{36}$/);
  });
});
