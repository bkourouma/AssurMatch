import { CrmConnectorService, type CrmConnectorDeps } from "./crm-connector.service";

export class CrmConnectorModule {
  readonly service: CrmConnectorService;

  constructor(deps: CrmConnectorDeps) {
    this.service = new CrmConnectorService(deps);
  }
}

export { CrmConnectorAuditActions } from "./crm-connector-audit-actions";
export {
  CRM_CONNECTOR_REPOSITORY,
  MemoryCrmConnectorRepository,
  PrismaCrmConnectorRepository,
  type CrmConnectorDeliveryRecord,
  type CrmConnectorRecord,
  type CrmConnectorRepository
} from "./crm-connector.repository";
export {
  CrmConnectorAccessRefusedError,
  CrmConnectorConflictError,
  CrmConnectorService,
  type CrmConnectorDeps,
  type CrmConnectorProcessSummary
} from "./crm-connector.service";
