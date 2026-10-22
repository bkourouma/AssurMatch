"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "../lib/backoffice-auth";
import { writeBrokerPlanChange, type PlanChangeWriteResult } from "./lot5-api";
import { PLAN_CHANGE_JUSTIFICATION_MAX_LENGTH, PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH, planChangeErrorMessage } from "./lot5-labels";

/**
 * Lot 5 (spec 071), G-06: plan-change request of the broker owner. The API re-checks the role, the
 * suspended-partner guard and the business rules (one pending request, a different plan).
 */
export interface PlanChangeActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = new Set(["starter", "pro", "enterprise"]);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refused(result: PlanChangeWriteResult): PlanChangeActionState {
  if (result.status === 401) redirect(loginRedirect("/billing", "session_expired"));
  return { status: "error", message: planChangeErrorMessage(result) };
}

export async function requestPlanChangeAction(_previous: PlanChangeActionState, formData: FormData): Promise<PlanChangeActionState> {
  const requestedPlan = text(formData, "requestedPlan");
  const justification = text(formData, "justification");
  if (!PLANS.has(requestedPlan) || justification.length < PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH || justification.length > PLAN_CHANGE_JUSTIFICATION_MAX_LENGTH) {
    return { status: "error", message: planChangeErrorMessage({ status: 400 }) };
  }
  const result = await writeBrokerPlanChange("/broker/billing/plan-change-requests", { requestedPlan, justification });
  if (!result.ok) return refused(result);
  revalidatePath("/billing");
  return { status: "success", message: "Demande envoyée. L'équipe AssurMatch la traite ; si elle est acceptée, le changement prend effet au prochain cycle mensuel." };
}

export async function cancelPlanChangeAction(_previous: PlanChangeActionState, formData: FormData): Promise<PlanChangeActionState> {
  const requestId = text(formData, "requestId");
  if (!UUID.test(requestId)) return { status: "error", message: planChangeErrorMessage({ status: 404 }) };
  const result = await writeBrokerPlanChange(`/broker/billing/plan-change-requests/${requestId}/cancel`, {});
  if (!result.ok) return refused(result);
  revalidatePath("/billing");
  return { status: "success", message: "Demande annulée." };
}
