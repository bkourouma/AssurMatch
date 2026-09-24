import type { RetentionTargets } from "./data-retention.repository";
import type { ErasureSubjectIds, RetentionSubjectsRepository } from "./retention-subjects.repository";

export interface EmailFingerprintPort {
  fingerprint(value: string): string;
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
      return this.toTargets(await this.subjects.findByEmailFingerprint(this.identity.fingerprint(subject.email.trim().toLowerCase())));
    }
    const direct = await this.subjects.findByPublicReference(subject.publicReference.trim());
    if (!direct.emailFingerprint) return this.toTargets(direct.subjects);
    return this.toTargets(this.merge(direct.subjects, await this.subjects.findByEmailFingerprint(direct.emailFingerprint)));
  }

  private merge(left: ErasureSubjectIds, right: ErasureSubjectIds): ErasureSubjectIds {
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
    return {
      prospects: union(left.prospects, right.prospects),
      quoteRequests: union(left.quoteRequests, right.quoteRequests),
      quoteDocuments: union(left.quoteDocuments, right.quoteDocuments),
      contactMessages: union(left.contactMessages, right.contactMessages),
      waitlist: union(left.waitlist, right.waitlist),
      partnerApplications: union(left.partnerApplications, right.partnerApplications)
    };
  }

  private toTargets(subjects: ErasureSubjectIds): RetentionTargets {
    return {
      quote_requests: subjects.quoteRequests,
      quote_documents: subjects.quoteDocuments,
      contact_messages: subjects.contactMessages,
      waitlist: subjects.waitlist,
      partner_applications: subjects.partnerApplications,
      ...(subjects.prospects.length > 0 ? { prospects: subjects.prospects } : {})
    };
  }
}
