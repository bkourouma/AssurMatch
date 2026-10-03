import { LeadProposalAuditActions } from "../audit-logs/lead-proposal-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "./lead-assignment.service";

/** The state of the request behind a lead, as far as contact visibility is concerned. */
export interface LeadQuoteState {
  status: string;
  refusalReason?: string | undefined;
  anonymizedAt?: Date | string | null | undefined;
}

export type LeadQuoteStateLookup = (quoteRequestId: string) => Promise<LeadQuoteState | undefined>;
/** Consented contact of the request, for an assignment record that does not carry it (memory runtime). */
export type LeadContactLookup = (quoteRequestId: string) => Promise<Record<string, unknown> | undefined>;

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user?.slice(0, 2) ?? "**"}***@${domain ?? "masked"}`;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

/**
 * Spec 055 FR-001 (decision D-2): the broker the lead is assigned to sees the visitor's full
 * contact from the assignment on, Starter and CRM alike, and every such reveal is audited. Any
 * other broker never reaches the lead (tenant checks of the access policies); after a consent
 * withdrawal (or an anonymization) the contact is masked for every broker.
 */
export class LeadContactPolicy {
  constructor(private readonly audit: AuditLogWriter, private readonly quoteState?: LeadQuoteStateLookup, private readonly contactLookup?: LeadContactLookup) {}

  async reveal(assignment: LeadAssignmentRecord, actor: ActorContext, surface: "starter" | "crm"): Promise<{ contact: Record<string, unknown>; visibility: "full" | "masked" }> {
    const stored = assignment.contact ?? {};
    const contact = Object.keys(stored).length > 0 ? stored : (this.contactLookup ? await this.contactLookup(assignment.quoteRequestId).catch(() => undefined) : undefined) ?? {};
    const reason = await this.maskReason(assignment);
    if (reason) {
      const email = typeof contact.email === "string" ? contact.email : undefined;
      const phone = typeof contact.phone === "string" ? contact.phone : undefined;
      this.write(actor, assignment, LeadProposalAuditActions.contactMasked, surface, reason);
      return {
        contact: {
          ...(email ? { emailMasked: maskEmail(email) } : {}),
          ...(phone ? { phoneMasked: maskPhone(phone) } : {})
        },
        visibility: "masked"
      };
    }
    this.write(actor, assignment, LeadProposalAuditActions.contactRevealed, surface);
    return { contact: { ...contact }, visibility: "full" };
  }

  private async maskReason(assignment: LeadAssignmentRecord): Promise<string | undefined> {
    if (assignment.actionReason === "consent_withdrawn") return "consent_withdrawn";
    const state = this.quoteState ? await this.quoteState(assignment.quoteRequestId).catch(() => undefined) : undefined;
    if (state?.anonymizedAt) return "quote_anonymized";
    if (state?.status === "cancelled") return "consent_withdrawn";
    return undefined;
  }

  private write(actor: ActorContext, assignment: LeadAssignmentRecord, action: string, surface: string, reason?: string): void {
    this.audit.write({
      actor,
      action,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { surface }
    });
  }
}
