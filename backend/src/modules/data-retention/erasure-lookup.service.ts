import type { RetentionTargets } from "./data-retention.repository";
import type { ErasureSubjectIds, RetentionSubjectsRepository } from "./retention-subjects.repository";

export interface EmailFingerprintPort {
  fingerprint(value: string): string;
  /** Lot 8 (spec 075 FR-A2): blind index of an e-mail (prospects written encrypted); undefined without key. */
  emailBlindIndex?(value: string): string | undefined;
}

export type ErasureSubject = { publicReference: string } | { email: string };

/**
 * D3: resolves every row of one person from a public reference or an e-mail address. The
 * fingerprint is computed and used in memory only: it is neither returned nor stored, and the
 * batch keeps the resolved row ids. An unknown subject resolves to nothing rather than to an error,
 * so the lookup cannot be used to learn whether someone is known to the platform.
 */
export class ErasureLookupService {
  constructor(private readonly subjects: RetentionSubjectsRepository, private readonly identity: EmailFingerprintPort) {}

  async resolve(subject: ErasureSubject): Promise<RetentionTargets> {
    if ("email" in subject) {
      const email = subject.email.trim().toLowerCase();
      // Lot 8: legacy fingerprint OR blind index, both computed in memory only.
      const blindIndex = this.identity.emailBlindIndex?.(email);
      return this.toTargets(blindIndex
        ? await this.subjects.findByEmailFingerprint(this.identity.fingerprint(email), blindIndex)
        : await this.subjects.findByEmailFingerprint(this.identity.fingerprint(email)));
    }
    const direct = await this.subjects.findByPublicReference(subject.publicReference.trim());
    if (!direct.emailFingerprint) return this.toTargets(direct.subjects);
    const related = direct.emailBlindIndex
      ? await this.subjects.findByEmailFingerprint(direct.emailFingerprint, direct.emailBlindIndex)
      : await this.subjects.findByEmailFingerprint(direct.emailFingerprint);
    return this.toTargets(this.merge(direct.subjects, related));
  }

  private merge(left: ErasureSubjectIds, right: ErasureSubjectIds): ErasureSubjectIds {
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
    return {
      prospects: union(left.prospects, right.prospects),
      quoteRequests: union(left.quoteRequests, right.quoteRequests),
      quoteDocuments: union(left.quoteDocuments, right.quoteDocuments),
      contactMessages: union(left.contactMessages, right.contactMessages),
      waitlist: union(left.waitlist, right.waitlist),
      partnerApplications: union(left.partnerApplications, right.partnerApplications),
      leadMessageThreads: union(left.leadMessageThreads, right.leadMessageThreads),
      leadDocumentRequests: union(left.leadDocumentRequests, right.leadDocumentRequests),
      dataRequests: union(left.dataRequests, right.dataRequests)
    };
  }

  private toTargets(subjects: ErasureSubjectIds): RetentionTargets {
    return {
      quote_requests: subjects.quoteRequests,
      quote_documents: subjects.quoteDocuments,
      contact_messages: subjects.contactMessages,
      waitlist: subjects.waitlist,
      partner_applications: subjects.partnerApplications,
      // Spec 062: conversation, document requests (by lead assignment) and data requests of the person.
      lead_message_threads: subjects.leadMessageThreads,
      lead_document_requests: subjects.leadDocumentRequests,
      data_requests: subjects.dataRequests,
      ...(subjects.prospects.length > 0 ? { prospects: subjects.prospects } : {})
    };
  }
}
