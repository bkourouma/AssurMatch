import { partnerWebhookEventTypeSchema, type PartnerWebhookEventType } from "../../../../packages/shared/contracts/partner-integration.contracts";
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

/**
 * Spec 054 R6: internal lead events. They feed the visitor notifications only and are never sent to
 * a partner webhook, whose catalogue (spec 039) is `partnerWebhookEventTypeSchema`.
 */
export type InternalLeadEventType = "lead.accepted" | "lead.rejected" | "lead.reassigned";
export type LeadBusEventType = PartnerWebhookEventType | InternalLeadEventType;

const WEBHOOK_EVENT_TYPES = new Set<string>(partnerWebhookEventTypeSchema.options);

export function isPartnerWebhookEventType(eventType: string): eventType is PartnerWebhookEventType {
  return WEBHOOK_EVENT_TYPES.has(eventType);
}

export interface PartnerWebhookEventPublisherDeps {
  audit: AuditLogWriter;
  integrations?: PartnerWebhookPreparer | undefined;
  onEvent?: (eventType: LeadBusEventType, partnerTenantId: string, data: Record<string, unknown>) => Promise<void>;
}

/**
 * Fail-safe bridge between domain flows and partner webhooks. A webhook is an observation of what
 * already happened: it must never break, delay or alter the lead operation that produced it, so
 * every error is caught and audited instead of propagating to the caller.
 */
export class PartnerWebhookEventPublisher {
  constructor(private readonly deps: PartnerWebhookEventPublisherDeps) {}

  async publish(eventType: LeadBusEventType, partnerTenantId: string, data: Record<string, unknown>): Promise<void> {
    if (this.deps.onEvent) {
      await this.deps.onEvent(eventType, partnerTenantId, data).catch(() => {});
    }
    // Spec 054 R6: internal event types stop here; only the published catalogue reaches webhooks.
    if (!isPartnerWebhookEventType(eventType)) return;
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
