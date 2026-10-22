export const CrmConnectorAuditActions = {
  connectorCreated: "crm_connector.created",
  connectorUpdated: "crm_connector.updated",
  secretRotated: "crm_connector.secret_rotated",
  connectorListed: "crm_connector.listed",
  deliveriesListed: "crm_connector.deliveries_listed",
  accessRefused: "crm_connector.access_refused",
  deliveryPrepared: "crm_connector.delivery_prepared",
  deliveryPublicationFailed: "crm_connector.delivery_publication_failed",
  deliveryAttemptRecorded: "crm_connector.delivery_attempt_recorded",
  deliveryRefused: "crm_connector.delivery_refused"
} as const;
