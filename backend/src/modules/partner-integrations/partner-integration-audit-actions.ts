export const PartnerIntegrationAuditActions = {
  apiKeyCreated: "partner_api.key_created",
  apiKeyRevoked: "partner_api.key_revoked",
  apiKeyRefused: "partner_api.key_refused",
  apiRead: "partner_api.read",
  apiReadRefused: "partner_api.read_refused",
  webhookEndpointCreated: "partner_webhook.endpoint_created",
  webhookEndpointUpdated: "partner_webhook.endpoint_updated",
  webhookDeliveryPrepared: "partner_webhook.delivery_prepared",
  webhookDeliverySkipped: "partner_webhook.delivery_skipped",
  webhookDeliveryAttemptRecorded: "partner_webhook.delivery_attempt_recorded"
} as const;
