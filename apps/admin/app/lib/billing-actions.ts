"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const PLANS = new Set(["starter", "pro", "enterprise"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: FormDataEntryValue | null): number {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function callBillingApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return response.status;
  } catch {
    return 0;
  }
}

function outcome(status: number, success: string): string {
  if (status === 200 || status === 201) return success;
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "disabled";
  if (status === 400) return "invalid";
  return "error";
}

/** Updates the plan price used to compute non-billable drafts. Never issues or collects anything. */
export async function upsertBillingPlanAction(formData: FormData): Promise<void> {
  const plan = stringValue(formData.get("plan"));
  const countryCode = stringValue(formData.get("countryCode")).trim().toUpperCase();
  const reason = stringValue(formData.get("reason")).trim();
  if (!PLANS.has(plan) || countryCode.length !== 2 || reason.length < 3) redirect("/billing?billing=invalid");
  const status = await callBillingApi("/admin/billing/plans", "PUT", {
    plan,
    countryCode,
    monthlySubscription: numberValue(formData.get("monthlySubscription")),
    perLeadPrice: numberValue(formData.get("perLeadPrice")),
    setupFee: numberValue(formData.get("setupFee")),
    reason
  });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?billing=${outcome(status, "plan_saved")}`);
}

/** Recomputes the monthly drafts; the result stays `draft_not_billable`. */
export async function recomputeDraftInvoicesAction(formData: FormData): Promise<void> {
  const partnerId = stringValue(formData.get("partnerId")).trim();
  const reason = stringValue(formData.get("reason")).trim() || "Recalcul des brouillons mensuels";
  const status = await callBillingApi("/admin/billing/invoices/recompute", "POST", { ...(UUID.test(partnerId) ? { partnerId } : {}), reason });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?billing=${outcome(status, "drafts_computed")}`);
}

/**
 * Grants prepaid lead credits; no payment is captured by this action. Spec 060 J-03: the grant may
 * cite the invoice whose payment finance recorded (the API checks partner and payment status).
 */
export async function grantLeadPackAction(formData: FormData): Promise<void> {
  const partnerId = stringValue(formData.get("partnerId")).trim();
  const credits = Math.trunc(numberValue(formData.get("credits")));
  const reason = stringValue(formData.get("reason")).trim();
  const invoiceId = stringValue(formData.get("invoiceId")).trim();
  const returnTab = stringValue(formData.get("returnTab")) === "comptes" ? `tab=comptes&partner=${encodeURIComponent(partnerId)}&` : "tab=packs&";
  if (!UUID.test(partnerId) || credits < 1 || reason.length < 3 || (invoiceId && !UUID.test(invoiceId))) redirect(`/billing?${returnTab}billing=invalid`);
  const status = await callBillingApi("/admin/billing/packs", "POST", { partnerId, credits, reason, ...(invoiceId ? { invoiceId } : {}) });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?${returnTab}billing=${outcome(status, "pack_granted")}`);
}

const PAYMENT_METHODS = new Set(["bank_transfer", "mobile_money", "cheque", "other"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Spec 060 J-01: issues the numbered invoice of a monthly draft (finance or super admin). */
export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const draftId = stringValue(formData.get("draftId")).trim();
  const reason = stringValue(formData.get("reason")).trim() || "Emission de la facture mensuelle";
  if (!UUID.test(draftId)) redirect("/billing?tab=factures&billing=invalid");
  const status = await callBillingApi("/admin/billing/issued-invoices", "POST", { draftId, reason });
  if (status === 401) redirect(loginRedirect("/billing?tab=factures", "session_expired"));
  redirect(`/billing?tab=factures&billing=${outcome(status, "invoice_issued")}`);
}

/** Spec 060 J-02: records a payment received outside the platform (bank transfer, mobile money). */
export async function recordInvoicePaymentAction(formData: FormData): Promise<void> {
  const invoiceId = stringValue(formData.get("invoiceId")).trim();
  const amount = Math.trunc(numberValue(formData.get("amount")));
  const receivedAt = stringValue(formData.get("receivedAt")).trim();
  const method = stringValue(formData.get("method"));
  const reference = stringValue(formData.get("reference")).trim();
  const note = stringValue(formData.get("note")).trim();
  if (!UUID.test(invoiceId) || amount < 1 || !ISO_DAY.test(receivedAt) || !PAYMENT_METHODS.has(method) || reference.length < 2) {
    redirect("/billing?tab=factures&billing=invalid");
  }
  const status = await callBillingApi(`/admin/billing/issued-invoices/${invoiceId}/payments`, "POST", { amount, receivedAt, method, reference, ...(note ? { note } : {}) });
  if (status === 401) redirect(loginRedirect("/billing?tab=factures", "session_expired"));
  redirect(`/billing?tab=factures&billing=${outcome(status, "payment_recorded")}`);
}

/** Spec 060 FR-09: cancels an unpaid invoice with a numbered credit note; nothing is deleted. */
export async function issueCreditNoteAction(formData: FormData): Promise<void> {
  const invoiceId = stringValue(formData.get("invoiceId")).trim();
  const reason = stringValue(formData.get("reason")).trim();
  if (!UUID.test(invoiceId) || reason.length < 8) redirect("/billing?tab=factures&billing=invalid");
  const status = await callBillingApi(`/admin/billing/issued-invoices/${invoiceId}/credit-note`, "POST", { reason });
  if (status === 401) redirect(loginRedirect("/billing?tab=factures", "session_expired"));
  redirect(`/billing?tab=factures&billing=${outcome(status, "credit_note_issued")}`);
}
