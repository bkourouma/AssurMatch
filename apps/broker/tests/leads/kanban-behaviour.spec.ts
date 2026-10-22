import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { BackOfficeProfile } from "../../app/lib/backoffice-auth";
import { canMutateCrmLead } from "../../app/lib/broker-permissions";
import {
  KANBAN_ERROR_MESSAGES,
  KANBAN_SAME_COLUMN_MESSAGE,
  canConfirmKanbanReason,
  decideKanbanDrop,
  effectiveKanbanTarget,
  failKanbanMove,
  kanbanColumnOf,
  kanbanMovesEnabled,
  kanbanOutcomeFromHttp,
  moveCardBetweenColumns,
  settleKanbanMove,
  withoutKanbanTarget
} from "../../app/lib/kanban-moves";
import type { KanbanColumns } from "../../app/lib/kanban-moves";
import { CRM_PIPELINE_STATUSES, CRM_STATUS_LABELS } from "../../app/lib/lead-vocabulary";

const read = (path: string) => readFileSync(path, "utf8");
const board = () => read("apps/broker/app/crm/kanban/kanban-board.tsx");
const action = () => read("apps/broker/app/lib/kanban-actions.ts");

type Card = { id: string };
function columns(): KanbanColumns<Card> {
  const result = Object.fromEntries(CRM_PIPELINE_STATUSES.map((status) => [status, [] as Card[]]));
  result.nouveau = [{ id: "a" }, { id: "b" }];
  result.qualifie = [{ id: "c" }];
  return result;
}

test("keyboard move end to end: target, decision, optimistic columns, success message and moved card", async () => {
  const snapshot = columns();
  expect(effectiveKanbanTarget("nouveau", "contacte")).toBe("contacte");
  expect(decideKanbanDrop("nouveau", "contacte")).toEqual({ kind: "move", status: "contacte" });
  const optimistic = moveCardBetweenColumns(snapshot, "a", "contacte");
  const settled = settleKanbanMove({ snapshot, optimistic, status: "contacte", statusLabel: CRM_STATUS_LABELS.contacte, result: kanbanOutcomeFromHttp({ status: 201, suspended: false }) });
  expect(settled.moved).toBe(true);
  expect(settled.columns).toBe(optimistic);
  expect(kanbanColumnOf(settled.columns, "a")).toBe("contacte");
  expect(settled.message.tone).toBe("info");
  expect(settled.message.text).toContain(`« ${CRM_STATUS_LABELS.contacte} »`);
  expect(settled.message.text).toContain("historisé");
});

test("an exit status asks for a reason first and the confirm button stays disabled without a valid reason", async () => {
  expect(decideKanbanDrop("nouveau", "perdu")).toEqual({ kind: "needs_reason", status: "perdu" });
  expect(canConfirmKanbanReason("", false)).toBe(false);
  expect(canConfirmKanbanReason("not_allowlisted", false)).toBe(false);
  expect(canConfirmKanbanReason("price", false)).toBe(true);
  expect(canConfirmKanbanReason("price", true)).toBe(false);
  expect(board()).toContain("disabled={!canConfirmKanbanReason(reason, busy)}");
});

test("a 403, 404, 409 or 5xx refusal puts the card back in its original column with the matching message", async () => {
  for (const [http, code] of [[403, "forbidden"], [409, "conflict"], [404, "not_found"], [500, "error"]] as const) {
    const snapshot = columns();
    const optimistic = moveCardBetweenColumns(snapshot, "a", "contacte");
    expect(kanbanColumnOf(optimistic, "a")).toBe("contacte");
    const settled = settleKanbanMove({ snapshot, optimistic, status: "contacte", statusLabel: "Contacté", result: kanbanOutcomeFromHttp({ status: http, suspended: false }) });
    expect(settled.moved, String(http)).toBe(false);
    expect(settled.columns, String(http)).toBe(snapshot);
    expect(kanbanColumnOf(settled.columns, "a")).toBe("nouveau");
    expect(settled.message).toEqual({ tone: "danger", text: KANBAN_ERROR_MESSAGES[code] });
  }
  const snapshot = columns();
  const suspended = settleKanbanMove({ snapshot, optimistic: moveCardBetweenColumns(snapshot, "c", "gagne"), status: "gagne", statusLabel: "Gagné", result: kanbanOutcomeFromHttp({ status: 403, suspended: true }) });
  expect(suspended.columns).toBe(snapshot);
  expect(suspended.message.text).toBe(KANBAN_ERROR_MESSAGES.suspended);
});

test("a thrown server action rolls back with the generic message", async () => {
  const snapshot = columns();
  const failed = failKanbanMove(snapshot);
  expect(failed.columns).toBe(snapshot);
  expect(failed.moved).toBe(false);
  expect(failed.message).toEqual({ tone: "danger", text: KANBAN_ERROR_MESSAGES.error });
});

test("the same column is never a valid keyboard target and a same-column drop is announced", async () => {
  expect(effectiveKanbanTarget("nouveau", "nouveau")).toBe("");
  expect(effectiveKanbanTarget("contacte", "nouveau")).toBe("nouveau");
  expect(effectiveKanbanTarget("nouveau", undefined)).toBe("");
  expect(effectiveKanbanTarget("nouveau", "elsewhere")).toBe("");
  expect(decideKanbanDrop("nouveau", "nouveau")).toEqual({ kind: "noop" });
  expect(KANBAN_SAME_COLUMN_MESSAGE).toBe("La carte est déjà dans cette colonne.");
  const source = board();
  expect(source).toContain("KANBAN_SAME_COLUMN_MESSAGE");
  expect(source).toContain("disabled={busy || !target}");
});

test("without the update right or on a suspended tenant no card is draggable and no move menu exists", async () => {
  const profile = (roles: string[], extra: Partial<BackOfficeProfile> = {}) => ({ roles, partnerTenantId: "tenant-a", partnerPlan: "pro" as const, mfaVerified: true, ...extra }) as BackOfficeProfile;
  const movable = (p: BackOfficeProfile) => kanbanMovesEnabled(canMutateCrmLead(p), p.tenantReadOnly === true);
  expect(movable(profile(["broker_read_only"]))).toBe(false);
  expect(movable(profile(["broker_owner_pro"], { tenantReadOnly: true }))).toBe(false);
  const source = board();
  expect(source).toContain("draggable={canMove}");
  expect(source).toContain("onDragStart={canMove ?");
  expect(source).toContain("onDrop={canMove ?");
  expect(source).toMatch(/\{canMove \? \(\s*<div>\s*<label htmlFor=\{targetId\}>/);
  expect(source).toContain("if (!canMove || busy) return;");
});

test("keyboard focus: reason field on open, moved card after success, origin control after cancel or rollback", async () => {
  const source = board();
  expect(source).toMatch(/if \(!pendingReason\) return;\s*document\.getElementById\("kanban-reason"\)\?\.focus\(\);/);
  expect(source).toContain('setFocusRequest({ leadId, target: settled.moved ? "card" : "control" })');
  expect(source).toContain('focusRequest.target === "card" ? card?.querySelector<HTMLElement>("a")');
  expect(source).toMatch(/setFocusRequest\(\{ leadId: pendingReason\.leadId, target: "control" \}\);\s*setPendingReason\(undefined\);/);
  // the keyboard target is dropped when a move starts and when the reason form is cancelled.
  expect(source).toContain("setTargets((current) => withoutKanbanTarget(current, leadId));");
  expect(source).toContain("setTargets((current) => withoutKanbanTarget(current, pendingReason.leadId));");
  expect(withoutKanbanTarget({ a: "perdu", b: "gagne" }, "a")).toEqual({ b: "gagne" });
});

test("moveCrmLeadStatusAction: UUID, reason, session redirect, role guard and relayed refusals, in that order", async () => {
  const source = action();
  const at = (needle: string) => {
    const index = source.indexOf(needle);
    expect(index, needle).toBeGreaterThan(-1);
    return index;
  };
  const order = ["!UUID.test(leadId)", "buildKanbanStatusBody(", "readBackOfficeSession()", "canMutateCrmLead(session.profile)", "callBrokerWrite(", "result.status === 401", "kanbanOutcomeFromHttp(result)", 'revalidatePath("/crm/kanban")'].map(at);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(source).toContain('return { ok: false, code: "invalid" }');
  expect(source).toContain('return { ok: false, code: "reason_required" }');
  expect(source).toContain('session.status !== "authenticated") redirect(loginRedirect("/crm/kanban", "session_expired"))');
  expect(source).toContain('if (!canMutateCrmLead(session.profile)) return { ok: false, code: "forbidden" }');
  expect(source).toContain('if (result.status === 401) redirect(loginRedirect("/crm/kanban", "session_expired"))');
  // Anything else than 401 is relayed to the board (rollback); only a success revalidates.
  expect(source).toContain("if (outcome.ok) {");
  expect(source).toContain("return outcome;");
  expect(kanbanOutcomeFromHttp({ status: 403, suspended: false })).toEqual({ ok: false, code: "forbidden" });
  expect(kanbanOutcomeFromHttp({ status: 409, suspended: false })).toEqual({ ok: false, code: "conflict" });
});
