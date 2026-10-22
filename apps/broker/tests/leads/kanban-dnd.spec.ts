import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { BackOfficeProfile } from "../../app/lib/backoffice-auth";
import { canMutateCrmLead } from "../../app/lib/broker-permissions";
import {
  KANBAN_ERROR_MESSAGES,
  KANBAN_FORBIDDEN_MESSAGE,
  KANBAN_READ_ONLY_MESSAGE,
  buildKanbanStatusBody,
  decideKanbanDrop,
  kanbanMovesEnabled,
  kanbanOutcomeFromHttp,
  moveCardBetweenColumns
} from "../../app/lib/kanban-moves";
import { CRM_PIPELINE_STATUSES, CRM_REASON_REQUIRED_STATUSES } from "../../app/lib/lead-vocabulary";
import { advisorDisplayName, teamAdvisorOptions } from "../../app/lib/team-options";

const read = (path: string) => readFileSync(path, "utf8");
const profile = (roles: string[], extra: Partial<BackOfficeProfile> = {}) => ({ roles, partnerTenantId: "tenant-a", partnerPlan: "pro" as const, mfaVerified: true, ...extra }) as BackOfficeProfile;

test("cards are draggable only for roles allowed to change a CRM status on an active tenant", async () => {
  const movable = (p: BackOfficeProfile) => kanbanMovesEnabled(canMutateCrmLead(p), p.tenantReadOnly === true);
  expect(movable(profile(["broker_owner_pro"]))).toBe(true);
  expect(movable(profile(["broker_manager"]))).toBe(true);
  expect(movable(profile(["broker_agent"]))).toBe(true);
  expect(movable(profile(["broker_read_only"]))).toBe(false);
  expect(movable(profile(["broker_owner_pro"], { tenantReadOnly: true }))).toBe(false);
  expect(KANBAN_READ_ONLY_MESSAGE).toBe("Lecture seule : votre rôle ne permet pas de modifier le statut");
});

test("a reason is required for the five exit statuses and never invented", async () => {
  for (const status of CRM_REASON_REQUIRED_STATUSES) {
    expect(decideKanbanDrop("nouveau", status), status).toEqual({ kind: "needs_reason", status });
    expect(buildKanbanStatusBody(status), status).toBeUndefined();
    expect(buildKanbanStatusBody(status, "not_allowlisted"), status).toBeUndefined();
    expect(buildKanbanStatusBody(status, "price")).toEqual({ status, reason: "price" });
  }
  expect(decideKanbanDrop("nouveau", "contacte")).toEqual({ kind: "move", status: "contacte" });
  expect(buildKanbanStatusBody("contacte")).toEqual({ status: "contacte" });
  expect(buildKanbanStatusBody("unknown")).toBeUndefined();
});

test("dropping on the same column or an unknown column does nothing", async () => {
  expect(decideKanbanDrop("qualifie", "qualifie")).toEqual({ kind: "noop" });
  expect(decideKanbanDrop("qualifie", "elsewhere")).toEqual({ kind: "noop" });
});

test("API errors map to cancelled moves with a clear message", async () => {
  expect(kanbanOutcomeFromHttp({ status: 200, suspended: false })).toEqual({ ok: true });
  expect(kanbanOutcomeFromHttp({ status: 403, suspended: false })).toEqual({ ok: false, code: "forbidden" });
  expect(KANBAN_ERROR_MESSAGES.forbidden).toBe(KANBAN_FORBIDDEN_MESSAGE);
  expect(KANBAN_FORBIDDEN_MESSAGE).toBe("Action refusée par votre rôle");
  expect(kanbanOutcomeFromHttp({ status: 403, suspended: true })).toEqual({ ok: false, code: "suspended" });
  expect(kanbanOutcomeFromHttp({ status: 409, suspended: false })).toEqual({ ok: false, code: "conflict" });
  expect(kanbanOutcomeFromHttp({ status: 400, suspended: false })).toEqual({ ok: false, code: "invalid" });
  expect(kanbanOutcomeFromHttp({ status: 422, suspended: false })).toEqual({ ok: false, code: "invalid" });
  expect(kanbanOutcomeFromHttp({ status: 404, suspended: false })).toEqual({ ok: false, code: "not_found" });
  expect(kanbanOutcomeFromHttp({ status: 0, suspended: false })).toEqual({ ok: false, code: "error" });
});

test("the optimistic move relocates the card and leaves the input untouched for rollback", async () => {
  const columns = Object.fromEntries(CRM_PIPELINE_STATUSES.map((s) => [s, [] as Array<{ id: string }>]));
  columns.nouveau = [{ id: "a" }, { id: "b" }];
  const moved = moveCardBetweenColumns(columns, "a", "contacte");
  expect(moved.nouveau?.map((c) => c.id)).toEqual(["b"]);
  expect(moved.contacte?.map((c) => c.id)).toEqual(["a"]);
  expect(columns.nouveau?.map((c) => c.id)).toEqual(["a", "b"]);
  expect(moveCardBetweenColumns(columns, "zzz", "contacte")).toBe(columns);
});

test("the board is a client island with drag and drop, a keyboard menu and an aria-live announcement", async () => {
  const board = read("apps/broker/app/crm/kanban/kanban-board.tsx");
  const page = read("apps/broker/app/crm/kanban/page.tsx");
  const action = read("apps/broker/app/lib/kanban-actions.ts");
  expect(board).toContain('"use client"');
  for (const token of ["onDragStart", "onDragOver", "onDrop", 'aria-live="polite"', "Déplacer", "KANBAN_READ_ONLY_MESSAGE", "CRM_OUTCOME_REASONS"]) expect(board).toContain(token);
  expect(page).toContain("isStarterCrmDenied");
  expect(page).toContain("loadAgencyFilter");
  expect(page).toContain("canMutateCrmLead");
  expect(action).toContain("/broker/crm/leads/${leadId}/status");
  expect(action).toContain("canMutateCrmLead");
});

test("CRM-006: team helpers list active members only and never expose a raw id as label", async () => {
  const members = [
    { id: "u1", displayName: "Awa Diop", roles: ["broker_manager"], status: "active" },
    { id: "u2", displayName: "Moussa Ba", roles: ["broker_agent"], status: "active" },
    { id: "u3", displayName: "Ancien", roles: ["broker_agent"], status: "suspended" },
    { id: "u4", displayName: "Invité", roles: ["broker_agent"], status: "invited" }
  ];
  expect(teamAdvisorOptions(members)).toEqual([
    { value: "u1", label: "Awa Diop (Manager)" },
    { value: "u2", label: "Moussa Ba (Agent)" }
  ]);
  expect(advisorDisplayName(members, "u2")).toBe("Moussa Ba");
  expect(advisorDisplayName(members, "unknown-id")).toBe("unknown-id");
  expect(advisorDisplayName(members, undefined)).toBe("Non assigné");
  expect(advisorDisplayName([], null)).toBe("Non assigné");
});

test("CRM-006: the lead detail uses a team select, no free advisor id field", async () => {
  const detail = read("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");
  expect(detail).toContain("readBrokerTeam");
  expect(detail).toContain("teamAdvisorOptions");
  expect(detail).toContain("Liste de l'équipe indisponible");
  expect(detail).not.toContain("Identifiant du conseiller");
  expect(detail).toContain("canAssign");
  expect(read("apps/broker/app/lib/proposal-actions.ts")).toContain("advisorPartnerTenantId");
});
