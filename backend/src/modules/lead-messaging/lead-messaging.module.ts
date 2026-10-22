import { DocumentRequestsService, type DocumentRequestsServiceDeps } from "./document-requests.service";
import { LeadMessagingService, type LeadMessagingServiceDeps } from "./lead-messaging.service";
import { MemoryLeadMessagingRepository, PrismaLeadMessagingRepository, type LeadMessagingRepository } from "./lead-messaging.repository";

/** Spec 062: broker <-> visitor messaging and document requests (one shared append-only store). */
export class LeadMessagingModule {
  readonly service: LeadMessagingService;
  readonly documentRequests: DocumentRequestsService;

  constructor(deps: LeadMessagingServiceDeps, documentDeps: Pick<DocumentRequestsServiceDeps, "documents" | "quotes" | "visitorAccess">) {
    const repository = deps.repository ?? new MemoryLeadMessagingRepository();
    this.service = new LeadMessagingService({ ...deps, repository });
    this.documentRequests = new DocumentRequestsService({
      audit: deps.audit,
      repository,
      assignments: deps.assignments,
      crmAccess: deps.crmAccess,
      starterAccess: deps.starterAccess,
      upload: deps.upload,
      partnerName: deps.partnerName,
      notifications: deps.notifications,
      abuseGuard: deps.abuseGuard,
      redis: deps.redis,
      isMessagingEnabled: deps.isMessagingEnabled,
      ...(deps.now ? { now: deps.now } : {}),
      ...documentDeps
    });
  }

  /** Spec 046: retention anonymization of the messages, attachments and document requests of these assignments. */
  async anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    await this.service.anonymizeForAssignments(leadAssignmentIds, marker, now);
    await this.documentRequests.anonymizeForAssignments(leadAssignmentIds, marker, now);
  }
}

export { MemoryLeadMessagingRepository, PrismaLeadMessagingRepository, type LeadMessagingRepository };
