import { ConflictException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { LeadAssignmentStatus } from "./lead-assignment.service";

/**
 * E2E correction wave (A-02a follow-up): the single table of allowed lead assignment status moves,
 * shared by the Starter actions, the generic CRM `PATCH` and `LeadAssignmentService.updateStatus`.
 *
 * Conservative reading of the existing flows: a lead waits for the broker's decision
 * (assigned / broker_notified / seen), is then accepted (and worked: received, contacted), or
 * rejected. A rejected lead can only be contested (disputed); disputed and closed are terminal for
 * the broker, except that a consent withdrawal closes any lead. Staying in the same status is never
 * a transition (the repeated call is refused, writes nothing and emits nothing).
 */
export const LEAD_STATUS_TRANSITIONS: Readonly<Record<LeadAssignmentStatus, readonly LeadAssignmentStatus[]>> = {
  assigned: ["broker_notified", "seen", "accepted", "rejected", "received", "contacted", "disputed", "closed"],
  broker_notified: ["seen", "accepted", "rejected", "received", "contacted", "disputed", "closed"],
  seen: ["accepted", "rejected", "received", "contacted", "disputed", "closed"],
  accepted: ["received", "contacted", "disputed", "closed"],
  received: ["contacted", "disputed", "closed"],
  contacted: ["received", "disputed", "closed"],
  rejected: ["disputed", "closed"],
  disputed: ["closed"],
  closed: []
};

/** Statuses a lead can still be rejected from (the broker has not taken it on yet). */
export const REJECTABLE_STATUSES: ReadonlySet<LeadAssignmentStatus> = new Set<LeadAssignmentStatus>(["assigned", "broker_notified", "seen"]);

export interface LeadTransitionRefusal {
  code: string;
  message: string;
  /** Short audit reason. */
  reason: string;
}

/** Returns null when `from` -> `to` is allowed, otherwise the refusal to report (409). */
export function leadTransitionRefusal(from: LeadAssignmentStatus, to: LeadAssignmentStatus): LeadTransitionRefusal | null {
  if (from !== to && LEAD_STATUS_TRANSITIONS[from].includes(to)) return null;
  if (to === "accepted") {
    return from === "accepted"
      ? { code: ErrorCodes.LEAD_ALREADY_ACCEPTED, message: "Lead already accepted", reason: "lead_already_accepted" }
      : { code: ErrorCodes.LEAD_STATUS_NOT_ACCEPTABLE, message: "Lead cannot be accepted from its current status", reason: "lead_status_not_acceptable" };
  }
  if (from === "closed") return { code: ErrorCodes.LEAD_CLOSED, message: "Lead already closed", reason: "lead_closed" };
  return { code: ErrorCodes.LEAD_STATUS_TRANSITION_NOT_ALLOWED, message: `Lead cannot move from ${from} to ${to}`, reason: "lead_status_transition_not_allowed" };
}

export function assertLeadTransition(from: LeadAssignmentStatus, to: LeadAssignmentStatus): void {
  const refusal = leadTransitionRefusal(from, to);
  if (refusal) throw new ConflictException({ code: refusal.code, message: refusal.message });
}
