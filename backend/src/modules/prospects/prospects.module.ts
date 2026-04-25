import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { ProspectIdentityService } from "./prospect-identity.service";
import { ProspectsService } from "./prospects.service";

export class ProspectsModule {
  readonly identity = new ProspectIdentityService();
  readonly service: ProspectsService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new ProspectsService(audit);
  }
}
