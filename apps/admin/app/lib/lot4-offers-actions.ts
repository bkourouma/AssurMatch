"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import {
  createAdminInsurer,
  requestAdminOfferSummary,
  retireAdminInsurer,
  updateAdminInsurer
} from "./lot4-offers-api";
import { insurerWriteErrorMessage } from "./offer-messages";

/**
 * Spec 070 (lot 4): server actions of the insurer referential and of the AI summary request of an
 * offer. Every insurer write carries the audited reason ("Motif (audité)", 8 characters minimum);
 * refusals come back as French messages. The AI summary is only queued here: a human validates it
 * afterwards on the AI assistance page (OFFER-010).
 */
export interface InsurerActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const REASON_MIN_LENGTH = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = ["active", "suspended"] as const;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function reasonError(reason: string): InsurerActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
}

function revalidateInsurers(insurerId?: string): void {
  revalidatePath("/insurers");
  if (insurerId) revalidatePath(`/insurers/${insurerId}`);
}

/** Creates an insurer for a country, then opens its page. */
export async function createInsurerAction(_previous: InsurerActionState, formData: FormData): Promise<InsurerActionState> {
  const countryId = text(formData, "countryId");
  const name = text(formData, "name");
  const code = text(formData, "code").toLowerCase();
  const approvalNumber = text(formData, "approvalNumber");
  const reason = text(formData, "reason");
  if (!UUID.test(countryId)) return { status: "error", message: "Choisissez un pays." };
  if (!name) return { status: "error", message: "Le nom de l'assureur est obligatoire." };
  if (code.length < 2 || !CODE.test(code)) {
    return { status: "error", message: "Code invalide : 2 caractères au moins, minuscules, chiffres et tirets (par exemple « saham-ci »)." };
  }
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const result = await createAdminInsurer({ countryId, name, code, reason, ...(approvalNumber ? { approvalNumber } : {}) });
  if (result.status === 401) redirect(loginRedirect("/insurers/new", "session_expired"));
  if (!result.ok || !result.data) return { status: "error", message: insurerWriteErrorMessage(result, "create") };
  revalidateInsurers();
  redirect(`/insurers/${encodeURIComponent(result.data.id)}?notice=created`);
}

/** Updates the name, the approval number and the active/suspended status (code and country are fixed). */
export async function updateInsurerAction(_previous: InsurerActionState, formData: FormData): Promise<InsurerActionState> {
  const insurerId = text(formData, "insurerId");
  const name = text(formData, "name");
  const approvalNumber = text(formData, "approvalNumber");
  const status = text(formData, "status");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  const reason = text(formData, "reason");
  if (!UUID.test(insurerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  if (!name) return { status: "error", message: "Le nom de l'assureur est obligatoire." };
  if (!(STATUSES as readonly string[]).includes(status)) return { status: "error", message: "Statut invalide : actif ou suspendu." };
  if (!expectedUpdatedAt) return { status: "error", message: "Référence de version manquante : rechargez la page." };
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const result = await updateAdminInsurer(insurerId, {
    name,
    approvalNumber,
    status: status as (typeof STATUSES)[number],
    expectedUpdatedAt,
    reason
  });
  if (result.status === 401) redirect(loginRedirect(`/insurers/${insurerId}`, "session_expired"));
  if (!result.ok) return { status: "error", message: insurerWriteErrorMessage(result, "update") };
  revalidateInsurers(insurerId);
  return { status: "success", message: "Assureur enregistré. Les offres existantes gardent leur lien." };
}

/** Retires an insurer (it can no longer be chosen for an offer). */
export async function retireInsurerAction(_previous: InsurerActionState, formData: FormData): Promise<InsurerActionState> {
  const insurerId = text(formData, "insurerId");
  if (!UUID.test(insurerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const invalid = reasonError(text(formData, "reason"));
  if (invalid) return invalid;
  const result = await retireAdminInsurer(insurerId, text(formData, "reason"));
  if (result.status === 401) redirect(loginRedirect(`/insurers/${insurerId}`, "session_expired"));
  if (!result.ok) return { status: "error", message: insurerWriteErrorMessage(result, "retire") };
  revalidateInsurers(insurerId);
  return { status: "success", message: "Assureur retiré : il n'apparaît plus dans les choix d'offre." };
}

function aiOutcome(status: number): string {
  if (status === 200 || status === 201 || status === 202) return "queued";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status === 422) return "disabled";
  return "error";
}

/** OFFER-010: queues an AI summary of the offer (admin only); the human validation happens on /ai-assistance. */
export async function generateOfferSummaryAction(formData: FormData): Promise<void> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) redirect("/offers");
  const path = `/offers/${encodeURIComponent(offerId)}`;
  const result = await requestAdminOfferSummary(offerId);
  if (result.status === 401) redirect(loginRedirect(path, "session_expired"));
  revalidatePath(path);
  redirect(`${path}?ai=${aiOutcome(result.status)}`);
}
