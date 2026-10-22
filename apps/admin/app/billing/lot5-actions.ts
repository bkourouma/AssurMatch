"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "../lib/backoffice-auth";
import { writeLot5, type Lot5WriteResult } from "./lot5-api";
import { lot5ErrorMessage } from "./lot5-labels";

/**
 * Lot 5 (spec 071): admin server actions of the add-on prices, assignments, subscription state and
 * plan-change decisions. The API re-checks the role (`billing:plan_manage`) and audits every write.
 */
export interface Lot5ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ADD_ON_KINDS = new Set(["api", "white_label", "ai"]);
const PLANS = new Set(["starter", "pro", "enterprise"]);
const SUBSCRIPTION_STATUSES = new Set(["active", "suspended", "cancelled"]);
const REASON_MIN_LENGTH = 3;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failure(result: Lot5WriteResult<unknown>): Lot5ActionState {
  if (result.status === 401) redirect(loginRedirect("/billing?tab=modules", "session_expired"));
  return { status: "error", message: lot5ErrorMessage(result.status, result.code) };
}

const invalid: Lot5ActionState = { status: "error", message: "Saisie incomplète : vérifiez les champs et le motif (3 caractères au moins)." };

export async function upsertAddOnPriceAction(_previous: Lot5ActionState, formData: FormData): Promise<Lot5ActionState> {
  const kind = text(formData, "kind");
  const plan = text(formData, "plan");
  const countryCode = text(formData, "countryCode").toUpperCase();
  const reason = text(formData, "reason");
  const monthlyAmount = Number(text(formData, "monthlyAmount"));
  if (!ADD_ON_KINDS.has(kind) || !PLANS.has(plan) || !/^[A-Z]{2}$/.test(countryCode) || reason.length < REASON_MIN_LENGTH) return invalid;
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0 || monthlyAmount > 10_000_000) return invalid;
  const result = await writeLot5("/admin/billing/add-on-prices", "PUT", {
    kind,
    plan,
    countryCode,
    monthlyAmount,
    enabled: formData.get("enabled") === "true" || formData.get("enabled") === "on",
    reason
  });
  if (!result.ok) return failure(result);
  revalidatePath("/billing");
  return { status: "success", message: "Prix du module enregistré et audité. Un module reste désactivé tant que « activé » n'est pas coché." };
}

export async function assignAddOnAction(_previous: Lot5ActionState, formData: FormData): Promise<Lot5ActionState> {
  const partnerId = text(formData, "partnerId");
  const kind = text(formData, "kind");
  const reason = text(formData, "reason");
  if (!UUID.test(partnerId) || !ADD_ON_KINDS.has(kind) || reason.length < REASON_MIN_LENGTH) return invalid;
  const result = await writeLot5("/admin/billing/add-ons", "POST", { partnerId, kind, reason });
  if (!result.ok) return failure(result);
  revalidatePath("/billing");
  return { status: "success", message: "Module affecté au courtier et audité. Il sera ajouté au prochain brouillon mensuel." };
}

export async function endAddOnAction(_previous: Lot5ActionState, formData: FormData): Promise<Lot5ActionState> {
  const addOnId = text(formData, "addOnId");
  const reason = text(formData, "reason");
  if (!UUID.test(addOnId) || reason.length < REASON_MIN_LENGTH) return invalid;
  const result = await writeLot5(`/admin/billing/add-ons/${addOnId}/end`, "POST", { reason });
  if (!result.ok) return failure(result);
  revalidatePath("/billing");
  return { status: "success", message: "Affectation terminée et auditée." };
}

export async function updateSubscriptionAction(_previous: Lot5ActionState, formData: FormData): Promise<Lot5ActionState> {
  const partnerId = text(formData, "partnerId");
  const status = text(formData, "status");
  const contractExpiresAt = text(formData, "contractExpiresAt");
  const reason = text(formData, "reason");
  if (!UUID.test(partnerId) || !SUBSCRIPTION_STATUSES.has(status) || reason.length < REASON_MIN_LENGTH) return invalid;
  if (contractExpiresAt && !ISO_DAY.test(contractExpiresAt)) return invalid;
  // An empty date clears the expiry (indefinite contract); the API keeps the stored value when omitted.
  const result = await writeLot5(`/admin/billing/subscriptions/${encodeURIComponent(partnerId)}`, "PUT", {
    status,
    contractExpiresAt: contractExpiresAt || null,
    reason
  });
  if (!result.ok) return failure(result);
  revalidatePath("/billing");
  return { status: "success", message: "État d'abonnement enregistré et audité. Le routage en tient compte aux prochaines demandes." };
}

export async function decidePlanChangeAction(_previous: Lot5ActionState, formData: FormData): Promise<Lot5ActionState> {
  const requestId = text(formData, "requestId");
  const decision = text(formData, "decision");
  const reason = text(formData, "reason");
  if (!UUID.test(requestId) || (decision !== "accept" && decision !== "refuse") || reason.length < REASON_MIN_LENGTH) {
    return { status: "error", message: "Décision incomplète : choisissez Accepter ou Refuser et saisissez un motif (3 caractères au moins)." };
  }
  const result = await writeLot5(`/admin/billing/plan-change-requests/${requestId}/decision`, "POST", { decision, reason });
  if (!result.ok) return failure(result);
  revalidatePath("/billing");
  return {
    status: "success",
    message: decision === "accept"
      ? "Demande acceptée et auditée : le changement prend effet au prochain cycle mensuel."
      : "Demande refusée et auditée : le courtier garde son plan actuel."
  };
}
