import type { Tone } from "./admin-ui";

/** Spec 056: badge tones of the operations consoles. */
export const quoteStatusTones: Record<string, Tone> = {
  created: "info",
  manual_review: "warning",
  routed: "success",
  non_routable: "danger",
  duplicate: "disabled",
  spam_blocked: "danger",
  cancelled: "disabled"
};

export const assignmentStatusTones: Record<string, Tone> = {
  assigned: "info",
  broker_notified: "info",
  seen: "info",
  accepted: "success",
  received: "success",
  contacted: "success",
  rejected: "danger",
  closed: "disabled",
  disputed: "warning"
};

export const contactStatusTones: Record<string, Tone> = { new: "warning", handled: "success", spam: "disabled" };

export const auditResultTones: Record<string, Tone> = { success: "success", refused: "warning", failed: "danger" };

export const routingResultTones: Record<string, Tone> = {
  assigned: "success",
  blocked: "danger",
  no_broker_available: "danger",
  pending_manual_assignment: "warning"
};
