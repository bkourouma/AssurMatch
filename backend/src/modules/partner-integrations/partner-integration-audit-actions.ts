export const PartnerIntegrationAuditActions = {
  apiKeyCreated: "partner_api.key_created",
  apiKeyRevoked: "partner_api.key_revoked",
  apiKeyRefused: "partner_api.key_refused",
  apiRead: "partner_api.read",
  apiReadRefused: "partner_api.read_refused",
  webhookEndpointCreated: "partner_webhook.endpoint_created",
  webhookEndpointUpdated: "partner_webhook.endpoint_updated",
  webhookAllowlistCreated: "partner_webhook.allowlist_created",
  webhookAllowlistRevoked: "partner_webhook.allowlist_revoked",
  webhookDeliveryPrepared: "partner_webhook.delivery_prepared",
  webhookDeliverySkipped: "partner_webhook.delivery_skipped",
  webhookDeliveryAttemptRecorded: "partner_webhook.delivery_attempt_recorded",
  webhookDeliveryRefused: "partner_webhook.delivery_refused",
  // Lot 7 (H-08): operator-triggered test send to a partner webhook endpoint.
  webhookTestSent: "partner_webhook.test_sent",
  webhookTestRefused: "partner_webhook.test_refused"
} as const;
