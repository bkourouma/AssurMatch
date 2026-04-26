import type { BrokerLeadStatusUpdateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { brokerLeadStatusUpdateSchema } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { LeadAccessPolicy } from "./lead-access-policy";
import { LeadAssignmentService } from "./lead-assignment.service";

export class BrokerLeadsController {
  private readonly access: LeadAccessPolicy;

  constructor(private readonly assignments: LeadAssignmentService, audit: AuditLogWriter) {
    this.access = new LeadAccessPolicy(audit);
  }

  async list(actor: ActorContext) {
    return (await this.assignments.list()).filter((assignment) => assignment.partnerTenantId === actor.partnerTenantId);
  }

  async detail(id: string, actor: ActorContext) {
    const assignment = await this.assignments.require(id);
    this.access.assertBrokerCanAccess(actor, assignment);
    return assignment;
  }

  async updateStatus(id: string, input: BrokerLeadStatusUpdateDto, actor: ActorContext) {
    const parsed = brokerLeadStatusUpdateSchema.parse(input);
    const assignment = await this.assignments.require(id);
    this.access.assertBrokerCanAccess(actor, assignment);
    return this.assignments.updateStatus(id, parsed.status, actor, parsed.reason);
  }
}
