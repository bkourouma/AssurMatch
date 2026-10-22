import { CRM_PIPELINE_STATUSES, crmStatusRequiresReason, isCrmOutcomeReason, isCrmPipelineStatus } from "./lead-vocabulary";
import type { CrmOutcomeReason, CrmPipelineStatus } from "./lead-vocabulary";
import { TENANT_SUSPENDED_MESSAGE } from "./broker-permissions";

/**
 * Pure rules of the CRM Kanban drag and drop. They mirror the status form of the lead detail and
 * `brokerCrmStatusUpdateSchema`; the API stays the authority (role, tenant, plan, MFA, audit).
 * No server import: the client board and the static tests use this module directly.
 */

export const KANBAN_READ_ONLY_MESSAGE = "Lecture seule : votre rôle ne permet pas de modifier le statut";
export const KANBAN_FORBIDDEN_MESSAGE = "Action refusée par votre rôle";

export type KanbanMoveErrorCode = "forbidden" | "suspended" | "conflict" | "invalid" | "reason_required" | "not_found" | "error";

export type KanbanMoveResult = { ok: true } | { ok: false; code: KanbanMoveErrorCode };

export const KANBAN_ERROR_MESSAGES: Record<KanbanMoveErrorCode, string> = {
  forbidden: KANBAN_FORBIDDEN_MESSAGE,
  suspended: TENANT_SUSPENDED_MESSAGE,
  conflict: "Changement refusé : le statut du lead a évolué entre-temps. Rechargez la vue.",
  invalid: "Changement de statut invalide. Le déplacement a été annulé.",
  reason_required: "Un motif est obligatoire pour ce statut. Le déplacement a été annulé.",
  not_found: "Lead introuvable. Le déplacement a été annulé.",
  error: "Le statut n'a pas pu être modifié. Le déplacement a été annulé."
};

/** Cards are only draggable for a role allowed to change a CRM status, on an active tenant. */
export function kanbanMovesEnabled(canMutate: boolean, tenantReadOnly: boolean): boolean {
  return canMutate && !tenantReadOnly;
}

export type KanbanDropDecision =
  | { kind: "noop" }
  | { kind: "needs_reason"; status: CrmPipelineStatus }
  | { kind: "move"; status: CrmPipelineStatus };

/** Same column: nothing. A status that needs a reason opens the reason form first. */
export function decideKanbanDrop(from: string, to: string): KanbanDropDecision {
  if (!isCrmPipelineStatus(to) || from === to) return { kind: "noop" };
  return crmStatusRequiresReason(to) ? { kind: "needs_reason", status: to } : { kind: "move", status: to };
}

/** Request body of POST /broker/crm/leads/:leadId/status, or undefined when the contract would refuse it. */
export function buildKanbanStatusBody(status: string, reason?: string): { status: CrmPipelineStatus; reason?: CrmOutcomeReason } | undefined {
  if (!isCrmPipelineStatus(status)) return undefined;
  const validReason = reason && isCrmOutcomeReason(reason) ? reason : undefined;
  if (crmStatusRequiresReason(status) && !validReason) return undefined;
  return validReason ? { status, reason: validReason } : { status };
}

/** HTTP result of the API write to a UI outcome (401 is handled by the caller: redirect to login). */
export function kanbanOutcomeFromHttp(result: { status: number; suspended: boolean }): KanbanMoveResult {
  if (result.suspended) return { ok: false, code: "suspended" };
  if (result.status === 200 || result.status === 201) return { ok: true };
  if (result.status === 403) return { ok: false, code: "forbidden" };
  if (result.status === 409) return { ok: false, code: "conflict" };
  if (result.status === 404) return { ok: false, code: "not_found" };
  if (result.status === 400 || result.status === 422) return { ok: false, code: "invalid" };
  return { ok: false, code: "error" };
}

export type KanbanColumns<T> = Record<string, T[]>;

/** Optimistic move of a card between columns (returns a new object; unchanged when not found). */
export function moveCardBetweenColumns<T extends { id: string }>(columns: KanbanColumns<T>, leadId: string, to: string): KanbanColumns<T> {
  let card: T | undefined;
  const next: KanbanColumns<T> = {};
  for (const status of CRM_PIPELINE_STATUSES) {
    const cards = columns[status] ?? [];
    const found = cards.find((candidate) => candidate.id === leadId);
    if (found) card = found;
    next[status] = cards.filter((candidate) => candidate.id !== leadId);
  }
  if (!card || !isCrmPipelineStatus(to)) return columns;
  next[to] = [card, ...(next[to] ?? [])];
  return next;
}
