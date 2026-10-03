import { LeadDocumentsService, type LeadDocumentsServiceDeps } from "./lead-documents.service";
import { LeadProposalsService, type LeadProposalsServiceDeps } from "./lead-proposals.service";

/** Spec 055: broker response loop (proposals, visitor follow-up) and internal lead documents. */
export class LeadProposalsModule {
  readonly service: LeadProposalsService;
  readonly documents: LeadDocumentsService;

  constructor(deps: LeadProposalsServiceDeps, documentDeps: Omit<LeadDocumentsServiceDeps, "audit" | "assignments" | "crmAccess" | "crmHistory" | "upload">) {
    this.service = new LeadProposalsService(deps);
    this.documents = new LeadDocumentsService({
      audit: deps.audit,
      assignments: deps.assignments,
      crmAccess: deps.crmAccess,
      crmHistory: deps.crmHistory,
      upload: deps.upload,
      ...documentDeps
    });
  }
}

export { MemoryLeadProposalsRepository, PrismaLeadProposalsRepository, type LeadProposalsRepository } from "./lead-proposals.repository";
