import type { PartnerWebhookEventType } from "../../../../packages/shared/contracts/partner-integration.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PartnerIntegrationAuditActions } from "./partner-integration-audit-actions";

export interface PartnerWebhookPreparer {
  prepareWebhookDelivery(input: {
    partnerTenantId: string;
    eventType: PartnerWebhookEventType;
    data: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<unknown>;
}

export interface PartnerWebhookEventPublisherDeps {
  audit: AuditLogWriter;
  integrations?: PartnerWebhookPreparer | undefined;
}

/**
 * Fail-safe bridge between domain flows and partner webhooks. A webhook is an observation of what
 * already happened: it must never break, delay or alter the lead operation that produced it, so
 * every error is caught and audited instead of propagating to the caller.
 */
export class PartnerWebhookEventPublisher {
  constructor(private readonly deps: PartnerWebhookEventPublisherDeps) {}

  async publish(eventType: PartnerWebhookEventType, partnerTenantId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.deps.integrations || !partnerTenantId) return;
    try {
      await this.deps.integrations.prepareWebhookDelivery({ partnerTenantId, eventType, data });
    } catch (error) {
      this.deps.audit.write({
        action: PartnerIntegrationAuditActions.webhookDeliverySkipped,
        targetType: "PartnerWebhookDelivery",
        targetId: `${eventType}:${partnerTenantId}`,
        scope: { partnerTenantId },
        result: "failed",
        reason: "event_publication_failed",
        context: { eventType, error: error instanceof Error ? error.message.slice(0, 160) : "unknown_error" }
      });
    }
  }
}
