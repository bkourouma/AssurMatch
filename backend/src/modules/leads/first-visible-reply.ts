import type { LeadAssignmentRecord } from "./lead-assignment.service";

/**
 * Spec 062 E-08: the single definition of the "first visible reply" SLA measure, shared by the broker
 * dashboards, the enterprise SLA card and the admin partner overview so they never diverge.
 *
 * The first visible reply is the first proposal or the first broker message the visitor can see; the
 * assignment carries it as `firstVisibleReplyAt` (cleared on reassignment, so it always belongs to the
 * current partner). A visitor message never counts.
 */
export interface FirstVisibleReplySummary {
  averageFirstVisibleReplyMinutes: number | null;
  firstVisibleReplyMeasured: number;
  firstVisibleReplyWithinTarget: number;
  /** Same unit as `complianceRate` (a fraction of 1); `null` when nothing is measured. */
  firstVisibleReplyComplianceRate: number | null;
}

/** Minutes between the assignment and its first visible reply; `null` while the visitor saw nothing. */
export function firstVisibleReplyMinutes(assignment: Pick<LeadAssignmentRecord, "assignedAt" | "firstVisibleReplyAt">): number | null {
  if (!assignment.firstVisibleReplyAt) return null;
  return Math.max(0, Math.round((assignment.firstVisibleReplyAt.getTime() - assignment.assignedAt.getTime()) / 60_000));
}

export function summarizeFirstVisibleReply(assignments: ReadonlyArray<Pick<LeadAssignmentRecord, "assignedAt" | "firstVisibleReplyAt">>, targetMinutes: number): FirstVisibleReplySummary {
  const delays = assignments.map(firstVisibleReplyMinutes).filter((minutes): minutes is number => minutes !== null);
  const withinTarget = delays.filter((minutes) => minutes <= targetMinutes).length;
  return {
    averageFirstVisibleReplyMinutes: delays.length === 0 ? null : Math.round(delays.reduce((sum, minutes) => sum + minutes, 0) / delays.length),
    firstVisibleReplyMeasured: delays.length,
    firstVisibleReplyWithinTarget: withinTarget,
    firstVisibleReplyComplianceRate: delays.length === 0 ? null : withinTarget / delays.length
  };
}
