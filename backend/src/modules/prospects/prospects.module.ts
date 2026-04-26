import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { ProspectIdentityService } from "./prospect-identity.service";
import { ProspectsService } from "./prospects.service";
import type { ProspectsRepository } from "./prospects.repository";

export class ProspectsModule {
  readonly identity = new ProspectIdentityService();
  readonly service: ProspectsService;

  constructor(audit = new AuditLogWriter(), repository?: ProspectsRepository) {
    this.service = new ProspectsService(audit, repository);
  }
}
