import { PartnerIntegrationsService, type PartnerIntegrationsDeps } from "./partner-integrations.service";

export class PartnerIntegrationsModule {
  readonly service: PartnerIntegrationsService;

  constructor(deps: PartnerIntegrationsDeps) {
    this.service = new PartnerIntegrationsService(deps);
  }
}

export { PartnerIntegrationAuditActions } from "./partner-integration-audit-actions";
export { MemoryPartnerIntegrationsRepository, PrismaPartnerIntegrationsRepository, type PartnerIntegrationsRepository } from "./partner-integrations.repository";
export { PartnerIntegrationAccessRefusedError, PartnerIntegrationsService } from "./partner-integrations.service";
export { signWebhookPayload, verifyWebhookSignature } from "./webhook-signature.service";
export { assertWebhookDnsPublic, assertWebhookUrlShape, nodeWebhookDnsResolver, type WebhookDnsResolver } from "./webhook-url-policy";
