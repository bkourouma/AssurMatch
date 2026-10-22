import { readIntegerEnv } from "../../runtime/worker/delivery-worker-loop";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { DocumentReminderCandidate } from "../lead-messaging/lead-messaging.repository";
import { consentWithdrawn, leadState } from "../lead-messaging/lead-messaging.rules";
import type { QuoteNotificationService } from "./quote-notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Spec 067 (PRD section 23): the single reminder sent to the visitor when a document request stays
 * `open` for three days. A pointer only: no document label, no content.
 */
export interface VisitorDocumentReminderConfig {
  /** Age of an open request before the reminder is queued (default 3 days). */
  reminderDays: number;
  /** Minimal interval between two sweeps of the worker (default 60 minutes). */
  minIntervalMinutes: number;
}

export function visitorDocumentReminderConfigFromEnv(env: Record<string, string | undefined> = process.env): VisitorDocumentReminderConfig {
  return {
    reminderDays: readIntegerEnv(env, "ASSURMATCH_DOCUMENT_REMINDER_DAYS", 3, 1, 30),
    minIntervalMinutes: readIntegerEnv(env, "ASSURMATCH_DOCUMENT_REMINDER_INTERVAL_MINUTES", 60, 1, 1440)
  };
}

export interface VisitorDocumentReminderRun {
  /** Open requests older than the delay, never reminded. */
  examined: number;
  /** Reminders queued by this run (at most one per request / assignment / broker). */
  queued: number;
  /** Requests left alone: not applicable any more, unsubscribed, or already reminded. */
  skipped: number;
  /** Requests whose processing raised; they are retried by the next run. */
  failed: number;
}

export interface VisitorDocumentReminderDeps {
  requests: {
    listOpenForReminder(cutoff: Date): Promise<DocumentReminderCandidate[]>;
    markReminderQueued(ids: string[], at: Date): Promise<unknown>;
  };
  quotes: {
    findById(id: string): Promise<{
      id: string;
      publicReference: string;
      status: string;
      prospectId: string;
      language?: string | undefined;
      anonymizedAt?: Date | string | null | undefined;
    } | undefined>;
  };
  prospects: { findById(id: string): Promise<{ emailNormalized?: string | undefined } | undefined> };
  assignments: { findById(id: string): Promise<Pick<LeadAssignmentRecord, "id" | "partnerTenantId" | "status" | "crmStatus"> | undefined> };
  notifications: Pick<QuoteNotificationService, "queueVisitorDocumentsReminder">;
  /** Opt-out registry of the `document_reminder` purpose (same mechanism as the satisfaction survey). */
  unsubscribe: { isUnsubscribedFromReminders(email: string): Promise<boolean> };
  now?: () => Date;
}

const REMINDER_ACTOR: ActorContext = { actorId: "system:document-reminder", roles: [] };

/**
 * Worker task. Idempotent: the notification carries a persisted dedupe key per (request, assignment,
 * broker) and `reminderQueuedAt` is set on every request covered, so running it again, or on two
 * workers, never sends a second e-mail. Counters only: no address and no identifier is returned.
 */
export class VisitorDocumentReminderService {
  private lastRunAt: Date | undefined;
  private readonly config: VisitorDocumentReminderConfig;

  constructor(
    private readonly deps: VisitorDocumentReminderDeps,
    config: Partial<VisitorDocumentReminderConfig> = {}
  ) {
    this.config = { ...visitorDocumentReminderConfigFromEnv(), ...config };
  }

  /** Worker entry point: no-op until `minIntervalMinutes` elapsed since the last sweep in this process. */
  async runIfDue(now: Date = this.deps.now?.() ?? new Date()): Promise<VisitorDocumentReminderRun> {
    if (this.lastRunAt && now.getTime() - this.lastRunAt.getTime() < this.config.minIntervalMinutes * 60_000) {
      return { examined: 0, queued: 0, skipped: 1, failed: 0 };
    }
    this.lastRunAt = now;
    return this.run(now);
  }

  async run(now: Date = this.deps.now?.() ?? new Date()): Promise<VisitorDocumentReminderRun> {
    const run: VisitorDocumentReminderRun = { examined: 0, queued: 0, skipped: 0, failed: 0 };
    const cutoff = new Date(now.getTime() - this.config.reminderDays * DAY_MS);
    let candidates: DocumentReminderCandidate[];
    try {
      candidates = await this.deps.requests.listOpenForReminder(cutoff);
    } catch {
      run.failed += 1;
      return run;
    }
    run.examined = candidates.length;

    // One reminder per (request, assignment, broker), whatever the number of open requests it covers.
    const groups = new Map<string, DocumentReminderCandidate[]>();
    for (const candidate of candidates) {
      const key = JSON.stringify([candidate.quoteRequestId, candidate.leadAssignmentId, candidate.partnerTenantId]);
      const group = groups.get(key);
      if (group) group.push(candidate);
      else groups.set(key, [candidate]);
    }

    for (const group of groups.values()) {
      const [first] = group;
      if (!first) continue;
      try {
        const queuedNow = await this.remind(first, group, now);
        if (queuedNow === "queued") run.queued += 1;
        else run.skipped += group.length;
      } catch {
        run.failed += group.length;
      }
    }
    return run;
  }

  private async remind(first: DocumentReminderCandidate, group: DocumentReminderCandidate[], now: Date): Promise<"queued" | "skipped"> {
    const quote = await this.deps.quotes.findById(first.quoteRequestId);
    // Same reading as the document requests (spec 062): withdrawn consent, anonymization, closed or reassigned lead.
    if (!quote || consentWithdrawn(quote)) return "skipped";
    const assignment = await this.deps.assignments.findById(first.leadAssignmentId);
    if (!assignment || assignment.partnerTenantId !== first.partnerTenantId || leadState(assignment as LeadAssignmentRecord) === "closed") return "skipped";

    // The recipient is the prospect of THIS request, never another address (spec 066 F1).
    const prospect = await this.deps.prospects.findById(quote.prospectId);
    const email = prospect?.emailNormalized;
    if (!email) return "skipped";
    if (await this.deps.unsubscribe.isUnsubscribedFromReminders(email)) return "skipped";

    const queued = await this.deps.notifications.queueVisitorDocumentsReminder(
      { id: quote.id, publicReference: quote.publicReference },
      { assignmentId: first.leadAssignmentId, partnerTenantId: first.partnerTenantId },
      REMINDER_ACTOR
    );
    // Marked even when the dedupe key answered "already queued": the reminder exists, it must not be retried.
    await this.deps.requests.markReminderQueued(group.map((candidate) => candidate.id), now);
    return queued ? "queued" : "skipped";
  }
}
