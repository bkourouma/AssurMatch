"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "./backoffice-auth";
import { canMutateCrmLead } from "./broker-permissions";
import { callBrokerWrite } from "./broker-write";
import { buildKanbanStatusBody, kanbanOutcomeFromHttp } from "./kanban-moves";
import type { KanbanMoveResult } from "./kanban-moves";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kanban drag and drop: POST /broker/crm/leads/:leadId/status, same contract and same reason rules as
 * the status form of the lead detail (`changeCrmLeadStatusAction`). The API stays the authority: it
 * re-checks tenant, role, plan and MFA and audits every change. A 401 sends the broker to the login;
 * every other refusal is returned to the board, which rolls the optimistic move back.
 */
export async function moveCrmLeadStatusAction(leadId: string, status: string, reason?: string): Promise<KanbanMoveResult> {
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, code: "invalid" };
  const body = buildKanbanStatusBody(String(status), reason === undefined ? undefined : String(reason));
  if (!body) return { ok: false, code: "reason_required" };
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") redirect(loginRedirect("/crm/kanban", "session_expired"));
  if (!canMutateCrmLead(session.profile)) return { ok: false, code: "forbidden" };
  const result = await callBrokerWrite(`/broker/crm/leads/${leadId}/status`, "POST", body);
  if (result.status === 401) redirect(loginRedirect("/crm/kanban", "session_expired"));
  const outcome = kanbanOutcomeFromHttp(result);
  if (outcome.ok) {
    revalidatePath("/crm/kanban");
    revalidatePath("/crm/leads");
    revalidatePath(`/crm/leads/${leadId}`);
  }
  return outcome;
}
